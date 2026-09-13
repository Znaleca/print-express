-- Enforce a server-side 30-minute booking floor and add idempotent reminder events.

begin;

alter table if exists public.businesses
  alter column meeting_min_notice_minutes set default 30;

update public.businesses
set meeting_min_notice_minutes = 30
where meeting_min_notice_minutes is null or meeting_min_notice_minutes < 30;

alter table if exists public.businesses
  drop constraint if exists businesses_meeting_notice_check;

alter table if exists public.businesses
  add constraint businesses_meeting_notice_check check (meeting_min_notice_minutes between 30 and 10080);

alter table if exists public.video_call_email_events
  drop constraint if exists video_call_email_events_event_type_check;

alter table if exists public.video_call_email_events
  add constraint video_call_email_events_event_type_check
  check (event_type in ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'REMINDER_15'));

create index if not exists video_calls_reminder_due_idx
  on public.video_calls (scheduled_at)
  where status = 'SCHEDULED';

create or replace function public.validate_video_call_slot(
  p_business_id uuid,
  p_scheduled_at timestamptz,
  p_exclude_call_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  target_local timestamp;
  target_day integer;
  target_minutes integer;
  target_end_minutes integer;
  previous_day integer;
begin
  if p_scheduled_at is null then raise exception 'Choose a meeting time'; end if;

  select * into business_row from public.businesses where id = p_business_id;
  if not found or business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if p_scheduled_at < now() + make_interval(mins => greatest(30, coalesce(business_row.meeting_min_notice_minutes, 30))) then
    raise exception 'Choose a time at least 30 minutes from now';
  end if;
  if p_scheduled_at > now() + make_interval(days => business_row.meeting_max_days_ahead) then
    raise exception 'Choose a time within the shop booking window';
  end if;

  target_local := p_scheduled_at at time zone coalesce(nullif(business_row.timezone, ''), 'Asia/Manila');
  target_day := extract(dow from target_local)::integer;
  previous_day := (target_day + 6) % 7;
  target_minutes := extract(hour from target_local)::integer * 60 + extract(minute from target_local)::integer;
  target_end_minutes := target_minutes + business_row.meeting_duration_minutes;

  if not exists (
    select 1
    from public.business_hours h
    where h.business_id = p_business_id
      and h.is_closed is not true
      and (
        (
          h.day_of_week = target_day
          and h.opens_at < h.closes_at
          and target_minutes >= extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer
          and target_end_minutes <= extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
        )
        or (
          h.day_of_week = target_day
          and h.opens_at > h.closes_at
          and target_minutes >= extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer
          and target_end_minutes <= 1440 + extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
        )
        or (
          h.day_of_week = previous_day
          and h.opens_at > h.closes_at
          and target_minutes < extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
          and target_end_minutes <= extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
        )
      )
  ) then
    raise exception 'Choose a time during the shop published hours';
  end if;

  if exists (
    select 1
    from public.video_calls vc
    where vc.business_id = p_business_id
      and vc.id is distinct from p_exclude_call_id
      and vc.status in ('REQUESTED', 'SCHEDULED', 'LIVE')
      and coalesce(vc.scheduled_at, vc.requested_slot_at) is not null
      and coalesce(vc.scheduled_at, vc.requested_slot_at) < p_scheduled_at
        + make_interval(mins => (business_row.meeting_duration_minutes + business_row.meeting_buffer_minutes)::integer)
      and coalesce(vc.scheduled_at, vc.requested_slot_at)
        + make_interval(mins => (coalesce(vc.duration_minutes, business_row.meeting_duration_minutes) + coalesce(vc.buffer_minutes, business_row.meeting_buffer_minutes))::integer) > p_scheduled_at
  ) then
    raise exception 'That time was just booked. Choose another available time';
  end if;
end;
$$;

create or replace function public.video_call_book(
  p_conversation_id uuid,
  p_scheduled_at timestamptz,
  p_customer_note text default null,
  p_timezone text default null
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
  next_status text;
  shop_timezone text;
begin
  select * into conversation_row from public.chat_conversations where id = p_conversation_id for update;
  if not found or conversation_row.customer_id <> auth.uid() then
    raise exception 'Only the customer in this conversation can book a meeting';
  end if;

  select * into business_row from public.businesses where id = conversation_row.business_id for update;
  if not found or business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  shop_timezone := coalesce(nullif(business_row.timezone, ''), 'Asia/Manila');

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc limit 1;
  if found then
    if call_row.status = 'REQUESTED' and call_row.requested_slot_at is null then
      perform public.validate_video_call_slot(business_row.id, p_scheduled_at, call_row.id);
      update public.video_calls
      set requested_slot_at = p_scheduled_at,
          customer_note = nullif(left(coalesce(p_customer_note, ''), 500), ''),
          booking_timezone = shop_timezone,
          duration_minutes = business_row.meeting_duration_minutes,
          buffer_minutes = business_row.meeting_buffer_minutes,
          updated_at = now()
      where id = call_row.id
      returning * into call_row;
      insert into public.chat_messages (conversation_id, sender_id, sender_role, content, message_type, metadata, is_read)
      values (
        conversation_row.id, auth.uid(), 'CUSTOMER', 'Video consultation time requested', 'video_call',
        jsonb_build_object('video_call_id', call_row.id, 'event', 'rescheduled', 'requested_slot_at', call_row.requested_slot_at, 'booking_timezone', call_row.booking_timezone), false
      );
      return next call_row;
    end if;
    return next call_row;
    return;
  end if;

  perform public.validate_video_call_slot(business_row.id, p_scheduled_at, null);
  next_status := case when business_row.meeting_requires_approval then 'REQUESTED' else 'SCHEDULED' end;

  insert into public.video_calls (
    conversation_id, business_id, customer_id, owner_id, status, room_name,
    requested_slot_at, scheduled_at, available_from_at, expires_at,
    duration_minutes, buffer_minutes, customer_note, booking_timezone
  ) values (
    conversation_row.id, business_row.id, conversation_row.customer_id, conversation_row.owner_id,
    next_status, 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
    p_scheduled_at,
    case when next_status = 'SCHEDULED' then p_scheduled_at else null end,
    case when next_status = 'SCHEDULED' then p_scheduled_at - interval '15 minutes' else null end,
    case when next_status = 'SCHEDULED' then p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)) else null end,
    business_row.meeting_duration_minutes, business_row.meeting_buffer_minutes,
    nullif(left(coalesce(p_customer_note, ''), 500), ''), shop_timezone
  ) returning * into call_row;

  insert into public.chat_messages (conversation_id, sender_id, sender_role, content, message_type, metadata, is_read)
  values (
    conversation_row.id, auth.uid(), 'CUSTOMER',
    case when next_status = 'SCHEDULED' then 'Video consultation booked' else 'Video consultation requested' end,
    'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id,
      'event', 'scheduled',
      'source', 'customer_booking',
      'requested_slot_at', call_row.requested_slot_at,
      'scheduled_at', call_row.scheduled_at,
      'duration_minutes', call_row.duration_minutes,
      'booking_timezone', call_row.booking_timezone
    ),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_reschedule(
  p_call_id uuid,
  p_scheduled_at timestamptz,
  p_customer_note text default null,
  p_confirm boolean default false
)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  business_row public.businesses%rowtype;
  role_name text;
  next_status text;
begin
  select * into call_row from public.video_calls where id = p_call_id for update;
  if not found or (call_row.customer_id <> auth.uid() and call_row.owner_id <> auth.uid()) then
    raise exception 'You are not a participant in this video call';
  end if;
  if p_confirm and call_row.owner_id <> auth.uid() then
    raise exception 'Only the shop owner can confirm this meeting';
  end if;
  if call_row.status not in ('REQUESTED', 'SCHEDULED') then
    raise exception 'This call can no longer be rescheduled';
  end if;

  select * into business_row from public.businesses where id = call_row.business_id for update;
  perform public.validate_video_call_slot(call_row.business_id, p_scheduled_at, call_row.id);
  next_status := case when p_confirm or call_row.status = 'SCHEDULED' then 'SCHEDULED' else 'REQUESTED' end;
  role_name := case when call_row.owner_id = auth.uid() then 'BUSINESS_OWNER' else 'CUSTOMER' end;

  update public.video_calls
  set status = next_status,
      rescheduled_from_at = case when call_row.requested_slot_at is not null then call_row.requested_slot_at else scheduled_at end,
      reschedule_count = reschedule_count + 1,
      requested_slot_at = p_scheduled_at,
      scheduled_at = case when next_status = 'SCHEDULED' then p_scheduled_at else null end,
      available_from_at = case when next_status = 'SCHEDULED' then p_scheduled_at - interval '15 minutes' else null end,
      expires_at = case when next_status = 'SCHEDULED' then p_scheduled_at + make_interval(mins => greatest(30, duration_minutes)) else null end,
      booking_timezone = coalesce(nullif(business_row.timezone, ''), 'Asia/Manila'),
      customer_note = coalesce(nullif(left(p_customer_note, 500), ''), customer_note),
      updated_at = now()
  where id = p_call_id
  returning * into call_row;

  insert into public.chat_messages (conversation_id, sender_id, sender_role, content, message_type, metadata, is_read)
  values (
    call_row.conversation_id, auth.uid(), role_name, 'Video consultation rescheduled', 'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id, 'event', 'rescheduled',
      'scheduled_at', call_row.scheduled_at, 'requested_slot_at', call_row.requested_slot_at,
      'duration_minutes', call_row.duration_minutes, 'booking_timezone', call_row.booking_timezone
    ), false
  );
  return next call_row;
end;
$$;

commit;
