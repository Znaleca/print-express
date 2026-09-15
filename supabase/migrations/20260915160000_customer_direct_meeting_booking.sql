-- Customers book directly from owner-published availability. Initial bookings
-- no longer require a separate owner invitation or confirmation.

begin;

alter table public.businesses
  alter column meeting_requires_approval set default false;

update public.businesses
set meeting_requires_approval = false
where meeting_requires_approval is true;

-- Preserve reschedule confirmation requests. Only convert untouched initial
-- customer bookings that were waiting solely because the old setting was on.
update public.video_calls
set
  status = 'SCHEDULED',
  scheduled_at = requested_slot_at,
  available_from_at = requested_slot_at - interval '15 minutes',
  expires_at = requested_slot_at + make_interval(mins => greatest(30, duration_minutes)),
  confirmation_required_by = null,
  updated_at = now()
where status = 'REQUESTED'
  and requested_slot_at is not null
  and confirmation_required_by is null
  and rescheduled_from_at is null
  and coalesce(reschedule_count, 0) = 0;

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
  shop_timezone text;
begin
  select * into conversation_row
  from public.chat_conversations
  where id = p_conversation_id
  for update;

  if not found or conversation_row.customer_id <> auth.uid() then
    raise exception 'Only the customer in this conversation can book a meeting';
  end if;

  -- Serialize bookings for the shop. The existing exclusion constraint remains
  -- the final protection against two customers taking overlapping slots.
  select * into business_row
  from public.businesses
  where id = conversation_row.business_id
  for update;

  if not found or business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;

  shop_timezone := coalesce(nullif(business_row.timezone, ''), 'Asia/Manila');

  -- With cron-free cleanup, expire an elapsed meeting lazily before checking
  -- whether this conversation already has an active booking.
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
    if call_row.status <> 'REQUESTED'
       or call_row.requested_slot_at is not null
       or call_row.rescheduled_from_at is not null
       or coalesce(call_row.reschedule_count, 0) > 0 then
      raise exception 'You already have an active meeting. Reschedule it instead';
    end if;

    perform public.validate_video_call_slot(business_row.id, p_scheduled_at, call_row.id);

    update public.video_calls
    set
      status = 'SCHEDULED',
      confirmation_required_by = null,
      requested_slot_at = p_scheduled_at,
      scheduled_at = p_scheduled_at,
      available_from_at = p_scheduled_at - interval '15 minutes',
      expires_at = p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)),
      customer_note = nullif(left(coalesce(p_customer_note, ''), 500), ''),
      booking_timezone = shop_timezone,
      duration_minutes = business_row.meeting_duration_minutes,
      buffer_minutes = business_row.meeting_buffer_minutes,
      updated_at = now()
    where id = call_row.id
    returning * into call_row;
  else
    perform public.validate_video_call_slot(business_row.id, p_scheduled_at, null);

    insert into public.video_calls (
      conversation_id, business_id, customer_id, owner_id, status, room_name,
      confirmation_required_by, requested_slot_at, scheduled_at,
      available_from_at, expires_at, duration_minutes, buffer_minutes,
      customer_note, booking_timezone
    ) values (
      conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
      'SCHEDULED', 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
      null, p_scheduled_at, p_scheduled_at,
      p_scheduled_at - interval '15 minutes',
      p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)),
      business_row.meeting_duration_minutes, business_row.meeting_buffer_minutes,
      nullif(left(coalesce(p_customer_note, ''), 500), ''), shop_timezone
    ) returning * into call_row;
  end if;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    conversation_row.id,
    auth.uid(),
    'CUSTOMER',
    'Video consultation booked',
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

revoke all on function public.video_call_book(uuid, timestamptz, text, text)
  from public, anon;
grant execute on function public.video_call_book(uuid, timestamptz, text, text)
  to authenticated;

commit;
