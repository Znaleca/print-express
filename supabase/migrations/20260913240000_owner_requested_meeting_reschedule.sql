-- Let an owner reopen a missed meeting so the customer can choose a new time.

begin;

alter table if exists public.video_call_email_events
  drop constraint if exists video_call_email_events_event_type_check;

alter table if exists public.video_call_email_events
  add constraint video_call_email_events_event_type_check
  check (event_type in ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'RESCHEDULE_REQUESTED', 'REMINDER_15'));

create or replace function public.video_call_request_reschedule(p_call_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  previous_time timestamptz;
begin
  select * into call_row
  from public.video_calls
  where id = p_call_id
  for update;

  if not found or call_row.owner_id <> auth.uid() then
    raise exception 'Only the shop owner can request a reschedule';
  end if;
  if call_row.status = 'SCHEDULED' and (call_row.expires_at is null or now() <= call_row.expires_at) then
    raise exception 'This meeting is not marked as missed yet';
  end if;
  if call_row.status not in ('SCHEDULED', 'EXPIRED') then
    raise exception 'This meeting can no longer be rescheduled';
  end if;

  previous_time := coalesce(call_row.scheduled_at, call_row.requested_slot_at);
  update public.video_calls
  set status = 'REQUESTED',
      requested_slot_at = null,
      scheduled_at = null,
      available_from_at = null,
      expires_at = null,
      rescheduled_from_at = coalesce(previous_time, rescheduled_from_at),
      reschedule_count = reschedule_count + 1,
      updated_at = now()
  where id = p_call_id
  returning * into call_row;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    call_row.conversation_id,
    auth.uid(),
    'BUSINESS_OWNER',
    'The shop asked you to choose a new meeting time',
    'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id,
      'event', 'reschedule_requested',
      'source', 'owner_request',
      'rescheduled_from_at', call_row.rescheduled_from_at,
      'duration_minutes', call_row.duration_minutes,
      'booking_timezone', call_row.booking_timezone
    ),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.guard_video_call_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  event_name text;
  source_name text;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then return new; end if;
  if new.message_type <> 'video_call' then return new; end if;

  event_name := new.metadata->>'event';
  source_name := new.metadata->>'source';
  if new.metadata->>'video_call_id' is null or event_name not in ('requested', 'scheduled', 'rescheduled', 'cancelled', 'reschedule_requested') then
    raise exception 'Invalid video call message';
  end if;
  select * into call_row from public.video_calls where id = (new.metadata->>'video_call_id')::uuid;
  if not found or call_row.conversation_id <> new.conversation_id
     or new.sender_id <> auth.uid()
     or (new.sender_id <> call_row.customer_id and new.sender_id <> call_row.owner_id) then
    raise exception 'Video call message is not authorized';
  end if;
  if (new.sender_id = call_row.customer_id and new.sender_role <> 'CUSTOMER')
     or (new.sender_id = call_row.owner_id and new.sender_role <> 'BUSINESS_OWNER') then
    raise exception 'Video call sender role is invalid';
  end if;
  if (event_name = 'requested' and new.sender_id <> call_row.customer_id)
     or (event_name = 'scheduled' and new.sender_id <> call_row.owner_id and not (new.sender_id = call_row.customer_id and source_name = 'customer_booking'))
     or (event_name = 'rescheduled' and new.sender_id not in (call_row.customer_id, call_row.owner_id))
     or (event_name = 'reschedule_requested' and new.sender_id <> call_row.owner_id) then
    raise exception 'Video call event sender is invalid';
  end if;
  return new;
end;
$$;

revoke all on function public.video_call_request_reschedule(uuid) from public, anon;
grant execute on function public.video_call_request_reschedule(uuid) to authenticated;

commit;
