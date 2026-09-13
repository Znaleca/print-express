begin;

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

  -- A customer may propose a new time, but only the owner can confirm it.
  next_status := case
    when p_confirm or call_row.owner_id = auth.uid() then 'SCHEDULED'
    else 'REQUESTED'
  end;
  role_name := case when call_row.owner_id = auth.uid() then 'BUSINESS_OWNER' else 'CUSTOMER' end;

  update public.video_calls
  set status = next_status,
      rescheduled_from_at = case
        when call_row.status = 'REQUESTED' and call_row.rescheduled_from_at is not null
          then call_row.rescheduled_from_at
        else coalesce(call_row.scheduled_at, call_row.requested_slot_at, call_row.rescheduled_from_at)
      end,
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
    call_row.conversation_id,
    auth.uid(),
    role_name,
    case when next_status = 'REQUESTED'
      then 'New meeting time awaiting shop confirmation'
      else 'Video consultation rescheduled'
    end,
    'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id,
      'event', 'rescheduled',
      'status', call_row.status,
      'scheduled_at', call_row.scheduled_at,
      'requested_slot_at', call_row.requested_slot_at,
      'duration_minutes', call_row.duration_minutes,
      'booking_timezone', call_row.booking_timezone
    ),
    false
  );

  return next call_row;
end;
$$;

revoke all on function public.video_call_reschedule(uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.video_call_reschedule(uuid, timestamptz, text, boolean) to authenticated;

commit;
