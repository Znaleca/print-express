-- Make customer slot selection an actual reservation and avoid silent no-op bookings.

begin;

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
  select * into conversation_row
  from public.chat_conversations
  where id = p_conversation_id
  for update;

  if not found or conversation_row.customer_id <> auth.uid() then
    raise exception 'Only the customer in this conversation can book a meeting';
  end if;

  -- This lock serializes bookings for one shop. The exclusion constraint on
  -- video_calls remains the final database-level guard against overlap.
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
  next_status := case when business_row.meeting_requires_approval then 'REQUESTED' else 'SCHEDULED' end;

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id
    and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc
  limit 1
  for update;

  if found then
    if call_row.status <> 'REQUESTED' or call_row.requested_slot_at is not null then
      raise exception 'You already have an active meeting. Reschedule it instead';
    end if;

    perform public.validate_video_call_slot(business_row.id, p_scheduled_at, call_row.id);

    update public.video_calls
    set status = next_status,
        requested_slot_at = p_scheduled_at,
        scheduled_at = case when next_status = 'SCHEDULED' then p_scheduled_at else null end,
        available_from_at = case when next_status = 'SCHEDULED' then p_scheduled_at - interval '15 minutes' else null end,
        expires_at = case when next_status = 'SCHEDULED' then p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)) else null end,
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
      requested_slot_at, scheduled_at, available_from_at, expires_at,
      duration_minutes, buffer_minutes, customer_note, booking_timezone
    ) values (
      conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
      next_status, 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
      p_scheduled_at,
      case when next_status = 'SCHEDULED' then p_scheduled_at else null end,
      case when next_status = 'SCHEDULED' then p_scheduled_at - interval '15 minutes' else null end,
      case when next_status = 'SCHEDULED' then p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)) else null end,
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
    case when next_status = 'SCHEDULED' then 'Video consultation booked' else 'Video consultation requested' end,
    'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id,
      'event', case when next_status = 'SCHEDULED' then 'scheduled' else 'requested' end,
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

revoke all on function public.video_call_book(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.video_call_book(uuid, timestamptz, text, text) to authenticated;

commit;

