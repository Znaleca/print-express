-- Some environments already applied an older video-call guard after the
-- owner scheduling RPCs were introduced. Re-assert the complete event list so
-- owner scheduling invites and proposals cannot be rejected by that stale
-- trigger function.

begin;

create or replace function public.guard_video_call_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  event_name text;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.message_type <> 'video_call' then
    return new;
  end if;

  event_name := new.metadata->>'event';
  if new.metadata->>'video_call_id' is null
     or event_name is null
     or event_name not in (
       'requested', 'scheduled', 'cancelled', 'scheduling_invite',
       'proposed', 'rescheduled', 'reschedule_requested'
     ) then
    raise exception 'Invalid video call message';
  end if;

  select * into call_row
  from public.video_calls
  where id = (new.metadata->>'video_call_id')::uuid;

  if not found
     or call_row.conversation_id <> new.conversation_id
     or new.sender_id <> auth.uid()
     or (new.sender_id <> call_row.customer_id and new.sender_id <> call_row.owner_id) then
    raise exception 'Video call message is not authorized';
  end if;

  if (new.sender_id = call_row.customer_id and new.sender_role <> 'CUSTOMER')
     or (new.sender_id = call_row.owner_id and new.sender_role <> 'BUSINESS_OWNER') then
    raise exception 'Video call sender role is invalid';
  end if;

  if event_name = 'requested' and new.sender_id <> call_row.customer_id then
    raise exception 'Video call request sender is invalid';
  elsif event_name in ('scheduling_invite', 'proposed', 'reschedule_requested')
        and new.sender_id <> call_row.owner_id then
    raise exception 'Video call owner event sender is invalid';
  elsif event_name = 'scheduled'
        and new.sender_id <> call_row.customer_id
        and new.sender_id <> call_row.owner_id then
    raise exception 'Video call schedule sender is invalid';
  end if;

  return new;
end;
$$;

commit;

