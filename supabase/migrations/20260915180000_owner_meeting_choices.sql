-- Owner-initiated meeting choices: start now, invite the customer to choose,
-- or propose a published time that the customer must accept.

begin;

alter table if exists public.video_call_email_events
  drop constraint if exists video_call_email_events_event_type_check;

alter table if exists public.video_call_email_events
  add constraint video_call_email_events_event_type_check
  check (event_type in ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'RESCHEDULE_REQUESTED', 'SCHEDULING_INVITE', 'REMINDER_15'));

create or replace function public.video_call_owner_invite(p_conversation_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.chat_conversations%rowtype;
  business_row public.businesses%rowtype;
  call_row public.video_calls%rowtype;
begin
  select * into conversation_row
  from public.chat_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  select * into business_row
  from public.businesses
  where id = conversation_row.business_id
  for update;

  if not found or business_row.owner_id <> auth.uid() then
    raise exception 'Only this shop owner can invite the customer';
  end if;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' or business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;

  update public.video_calls
  set status = 'EXPIRED', updated_at = now()
  where conversation_id = p_conversation_id
    and status in ('SCHEDULED', 'LIVE')
    and expires_at is not null
    and expires_at < now();

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id
    and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc
  limit 1
  for update;

  if found then
    if call_row.status = 'REQUESTED'
       and call_row.requested_slot_at is null
       and call_row.rescheduled_from_at is null
       and coalesce(call_row.reschedule_count, 0) = 0 then
      return next call_row;
      return;
    end if;
    raise exception 'This conversation already has an active meeting';
  end if;

  insert into public.video_calls (
    conversation_id, business_id, customer_id, owner_id, status, room_name,
    confirmation_required_by, duration_minutes, buffer_minutes, booking_timezone
  ) values (
    conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
    'REQUESTED', 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
    'CUSTOMER', business_row.meeting_duration_minutes, business_row.meeting_buffer_minutes,
    coalesce(nullif(business_row.timezone, ''), 'Asia/Manila')
  ) returning * into call_row;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    conversation_row.id, auth.uid(), 'BUSINESS_OWNER',
    'Choose a time for an online meeting', 'video_call',
    jsonb_build_object('video_call_id', call_row.id, 'event', 'scheduling_invite', 'status', call_row.status),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_owner_propose(
  p_conversation_id uuid,
  p_scheduled_at timestamptz
)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.chat_conversations%rowtype;
  business_row public.businesses%rowtype;
  call_row public.video_calls%rowtype;
begin
  select * into conversation_row
  from public.chat_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  select * into business_row
  from public.businesses
  where id = conversation_row.business_id
  for update;

  if not found or business_row.owner_id <> auth.uid() then
    raise exception 'Only this shop owner can propose a meeting time';
  end if;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' or business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;

  update public.video_calls
  set status = 'EXPIRED', updated_at = now()
  where conversation_id = p_conversation_id
    and status in ('SCHEDULED', 'LIVE')
    and expires_at is not null
    and expires_at < now();

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id
    and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc
  limit 1
  for update;

  if found and not (
    call_row.status = 'REQUESTED'
    and call_row.requested_slot_at is null
    and call_row.rescheduled_from_at is null
    and coalesce(call_row.reschedule_count, 0) = 0
  ) then
    raise exception 'This conversation already has an active meeting';
  end if;

  perform public.validate_video_call_slot(business_row.id, p_scheduled_at, call_row.id);

  if call_row.id is not null then
    update public.video_calls
    set status = 'REQUESTED',
        confirmation_required_by = 'CUSTOMER',
        requested_slot_at = p_scheduled_at,
        scheduled_at = null,
        available_from_at = null,
        expires_at = null,
        duration_minutes = business_row.meeting_duration_minutes,
        buffer_minutes = business_row.meeting_buffer_minutes,
        booking_timezone = coalesce(nullif(business_row.timezone, ''), 'Asia/Manila'),
        updated_at = now()
    where id = call_row.id
    returning * into call_row;
  else
    insert into public.video_calls (
      conversation_id, business_id, customer_id, owner_id, status, room_name,
      confirmation_required_by, requested_slot_at, duration_minutes, buffer_minutes, booking_timezone
    ) values (
      conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
      'REQUESTED', 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
      'CUSTOMER', p_scheduled_at, business_row.meeting_duration_minutes,
      business_row.meeting_buffer_minutes, coalesce(nullif(business_row.timezone, ''), 'Asia/Manila')
    ) returning * into call_row;
  end if;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    conversation_row.id, auth.uid(), 'BUSINESS_OWNER',
    'Meeting time proposed for customer confirmation', 'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id, 'event', 'proposed', 'status', call_row.status,
      'confirmation_required_by', call_row.confirmation_required_by,
      'requested_slot_at', call_row.requested_slot_at,
      'duration_minutes', call_row.duration_minutes,
      'booking_timezone', call_row.booking_timezone
    ),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_owner_start_now(p_conversation_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.chat_conversations%rowtype;
  business_row public.businesses%rowtype;
  call_row public.video_calls%rowtype;
  start_time timestamptz := now();
begin
  select * into conversation_row
  from public.chat_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  select * into business_row
  from public.businesses
  where id = conversation_row.business_id
  for update;

  if not found or business_row.owner_id <> auth.uid() then
    raise exception 'Only this shop owner can start the call';
  end if;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' or business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;

  update public.video_calls
  set status = 'EXPIRED', updated_at = start_time
  where status in ('SCHEDULED', 'LIVE')
    and expires_at is not null
    and expires_at < start_time;

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id
    and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc
  limit 1
  for update;

  if found and not (
    call_row.status = 'REQUESTED'
    and call_row.requested_slot_at is null
    and call_row.rescheduled_from_at is null
    and coalesce(call_row.reschedule_count, 0) = 0
  ) then
    raise exception 'This conversation already has an active meeting';
  end if;

  if exists (
    select 1
    from public.video_calls vc
    where vc.business_id = business_row.id
      and vc.status in ('REQUESTED', 'SCHEDULED', 'LIVE')
      and vc.id is distinct from call_row.id
      and coalesce(vc.scheduled_at, vc.requested_slot_at) is not null
      and coalesce(vc.scheduled_at, vc.requested_slot_at) < start_time
        + make_interval(mins => (business_row.meeting_duration_minutes + business_row.meeting_buffer_minutes)::integer)
      and coalesce(vc.scheduled_at, vc.requested_slot_at)
        + make_interval(mins => (coalesce(vc.duration_minutes, business_row.meeting_duration_minutes) + coalesce(vc.buffer_minutes, business_row.meeting_buffer_minutes))::integer) > start_time
  ) then
    raise exception 'The shop already has a meeting during this time';
  end if;

  if call_row.id is not null then
    update public.video_calls
    set status = 'SCHEDULED',
        confirmation_required_by = null,
        requested_slot_at = start_time,
        scheduled_at = start_time,
        available_from_at = start_time,
        expires_at = start_time + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)),
        duration_minutes = business_row.meeting_duration_minutes,
        buffer_minutes = business_row.meeting_buffer_minutes,
        booking_timezone = coalesce(nullif(business_row.timezone, ''), 'Asia/Manila'),
        updated_at = start_time
    where id = call_row.id
    returning * into call_row;
  else
    insert into public.video_calls (
      conversation_id, business_id, customer_id, owner_id, status, room_name,
      confirmation_required_by, requested_slot_at, scheduled_at, available_from_at,
      expires_at, duration_minutes, buffer_minutes, booking_timezone
    ) values (
      conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
      'SCHEDULED', 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
      null, start_time, start_time, start_time,
      start_time + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)),
      business_row.meeting_duration_minutes, business_row.meeting_buffer_minutes,
      coalesce(nullif(business_row.timezone, ''), 'Asia/Manila')
    ) returning * into call_row;
  end if;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    conversation_row.id, auth.uid(), 'BUSINESS_OWNER',
    'Online meeting started now', 'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id, 'event', 'scheduled', 'source', 'owner_call_now',
      'scheduled_at', call_row.scheduled_at, 'duration_minutes', call_row.duration_minutes,
      'booking_timezone', call_row.booking_timezone
    ),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_confirm(p_call_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  business_row public.businesses%rowtype;
begin
  select * into call_row
  from public.video_calls
  where id = p_call_id
  for update;

  if not found then
    raise exception 'Video call not found';
  end if;

  if call_row.status = 'REQUESTED'
     and call_row.confirmation_required_by = 'CUSTOMER'
     and call_row.customer_id = auth.uid()
     and call_row.requested_slot_at is not null
     and call_row.scheduled_at is null
     and call_row.rescheduled_from_at is null
     and coalesce(call_row.reschedule_count, 0) = 0 then
    select * into business_row from public.businesses where id = call_row.business_id for update;
    perform public.validate_video_call_slot(call_row.business_id, call_row.requested_slot_at, call_row.id);

    update public.video_calls
    set status = 'SCHEDULED',
        confirmation_required_by = null,
        scheduled_at = requested_slot_at,
        available_from_at = requested_slot_at - interval '15 minutes',
        expires_at = requested_slot_at + make_interval(mins => greatest(30, duration_minutes)),
        updated_at = now()
    where id = p_call_id
    returning * into call_row;

    insert into public.chat_messages (
      conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
    ) values (
      call_row.conversation_id, auth.uid(), 'CUSTOMER',
      'Proposed meeting time accepted', 'video_call',
      jsonb_build_object(
        'video_call_id', call_row.id, 'event', 'scheduled', 'source', 'accepted_owner_proposal',
        'scheduled_at', call_row.scheduled_at, 'duration_minutes', call_row.duration_minutes,
        'booking_timezone', call_row.booking_timezone
      ),
      false
    );

    return next call_row;
    return;
  end if;

  return query
  select * from public.video_call_reschedule(
    p_call_id,
    call_row.requested_slot_at,
    null,
    true
  );
end;
$$;

revoke all on function public.video_call_owner_invite(uuid) from public, anon;
revoke all on function public.video_call_owner_propose(uuid, timestamptz) from public, anon;
revoke all on function public.video_call_owner_start_now(uuid) from public, anon;
revoke all on function public.video_call_confirm(uuid) from public, anon;
grant execute on function public.video_call_owner_invite(uuid) to authenticated;
grant execute on function public.video_call_owner_propose(uuid, timestamptz) to authenticated;
grant execute on function public.video_call_owner_start_now(uuid) to authenticated;
grant execute on function public.video_call_confirm(uuid) to authenticated;

commit;
