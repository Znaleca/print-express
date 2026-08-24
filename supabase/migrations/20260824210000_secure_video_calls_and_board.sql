-- Secure, database-backed video consultations and a collaborative proof board.
-- The chat remains the notification surface; these tables are the source of truth.

begin;

alter table if exists public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_read boolean not null default false,
  add column if not exists image_url text;

create table if not exists public.video_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED', 'EXPIRED')),
  room_name text not null unique,
  scheduled_at timestamptz,
  available_from_at timestamptz,
  expires_at timestamptz,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status = 'REQUESTED'
    or (scheduled_at is not null and available_from_at is not null and expires_at is not null)
  )
);

create index if not exists video_calls_conversation_idx
  on public.video_calls (conversation_id, created_at desc);

create index if not exists video_calls_business_status_idx
  on public.video_calls (business_id, status, scheduled_at desc);

create unique index if not exists video_calls_one_open_per_conversation_idx
  on public.video_calls (conversation_id)
  where status in ('REQUESTED', 'SCHEDULED', 'LIVE');

create table if not exists public.video_call_board_events (
  id uuid primary key default gen_random_uuid(),
  video_call_id uuid not null references public.video_calls(id) on delete cascade,
  event_type text not null check (event_type in ('stroke', 'image', 'clear')),
  created_by uuid not null references auth.users(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 500000)
);

create index if not exists video_call_board_events_call_idx
  on public.video_call_board_events (video_call_id, created_at asc);

alter table public.video_calls enable row level security;
alter table public.video_call_board_events enable row level security;

drop policy if exists "Video call participants can view calls" on public.video_calls;
create policy "Video call participants can view calls"
on public.video_calls for select to authenticated
using (
  customer_id = auth.uid()
  or owner_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "Video call participants can view board events" on public.video_call_board_events;
create policy "Video call participants can view board events"
on public.video_call_board_events for select to authenticated
using (
  exists (
    select 1 from public.video_calls vc
    where vc.id = video_call_id
      and (vc.customer_id = auth.uid() or vc.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Video call participants can add board events" on public.video_call_board_events;
create policy "Video call participants can add board events"
on public.video_call_board_events for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.video_calls vc
    where vc.id = video_call_id
      and vc.status in ('SCHEDULED', 'LIVE')
      and (vc.customer_id = auth.uid() or vc.owner_id = auth.uid())
  )
);

insert into storage.buckets (id, name, public)
values ('video-call-board', 'video-call-board', false)
on conflict (id) do nothing;

drop policy if exists "Participants can upload video board images" on storage.objects;
create policy "Participants can upload video board images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'video-call-board'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.video_calls vc
    where vc.id = ((storage.foldername(name))[1])::uuid
      and vc.status in ('SCHEDULED', 'LIVE')
      and (vc.customer_id = auth.uid() or vc.owner_id = auth.uid())
  )
);

drop policy if exists "Participants can view video board images" on storage.objects;
create policy "Participants can view video board images"
on storage.objects for select to authenticated
using (
  bucket_id = 'video-call-board'
  and exists (
    select 1 from public.video_calls vc
    where vc.id = ((storage.foldername(name))[1])::uuid
      and (vc.customer_id = auth.uid() or vc.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Participants can delete video board images" on storage.objects;
create policy "Participants can delete video board images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'video-call-board'
  and owner_id = auth.uid()::text
  and exists (
    select 1 from public.video_calls vc
    where vc.id = ((storage.foldername(name))[1])::uuid
      and (vc.customer_id = auth.uid() or vc.owner_id = auth.uid())
  )
);

create or replace function public.video_call_request(p_conversation_id uuid)
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

  if not found or conversation_row.customer_id <> auth.uid() then
    raise exception 'Only the customer in this conversation can request a video call';
  end if;

  select * into business_row from public.businesses where id = conversation_row.business_id;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' then
    raise exception 'This shop is not currently accepting video call requests';
  end if;

  select * into call_row
  from public.video_calls
  where conversation_id = p_conversation_id
    and status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  order by created_at desc
  limit 1;

  if found then
    return next call_row;
    return;
  end if;

  insert into public.video_calls (conversation_id, business_id, customer_id, owner_id, room_name)
  values (
    conversation_row.id,
    conversation_row.business_id,
    conversation_row.customer_id,
    business_row.owner_id,
    'pp-call-' || replace(gen_random_uuid()::text, '-', '')
  ) returning * into call_row;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    conversation_row.id,
    auth.uid(),
    'CUSTOMER',
    'Video consultation requested',
    'video_call',
    jsonb_build_object('video_call_id', call_row.id, 'event', 'requested'),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_schedule(
  p_call_id uuid,
  p_scheduled_at timestamptz
)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  target_time timestamptz := p_scheduled_at;
begin
  if target_time is null or target_time < now() + interval '5 minutes' then
    raise exception 'Choose a time at least five minutes from now';
  end if;
  if target_time > now() + interval '60 days' then
    raise exception 'Video calls can only be scheduled within the next 60 days';
  end if;

  select * into call_row from public.video_calls where id = p_call_id for update;
  if not found or call_row.owner_id <> auth.uid() then
    raise exception 'Only the shop owner can schedule this call';
  end if;
  if call_row.status not in ('REQUESTED', 'SCHEDULED') then
    raise exception 'This call can no longer be scheduled';
  end if;

  update public.video_calls
  set status = 'SCHEDULED',
      scheduled_at = target_time,
      available_from_at = target_time - interval '15 minutes',
      expires_at = target_time + interval '30 minutes',
      updated_at = now()
  where id = p_call_id
  returning * into call_row;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    call_row.conversation_id,
    auth.uid(),
    'BUSINESS_OWNER',
    'Video consultation scheduled',
    'video_call',
    jsonb_build_object(
      'video_call_id', call_row.id,
      'event', 'scheduled',
      'scheduled_at', call_row.scheduled_at,
      'available_from_at', call_row.available_from_at,
      'expires_at', call_row.expires_at
    ),
    false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_join(p_call_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
begin
  select * into call_row from public.video_calls where id = p_call_id for update;
  if not found or (call_row.customer_id <> auth.uid() and call_row.owner_id <> auth.uid() and not public.is_admin()) then
    raise exception 'You are not a participant in this video call';
  end if;
  if call_row.status in ('SCHEDULED', 'LIVE') and now() > call_row.expires_at then
    update public.video_calls set status = 'EXPIRED', updated_at = now() where id = p_call_id returning * into call_row;
    raise exception 'This video call has expired';
  end if;
  if call_row.status not in ('SCHEDULED', 'LIVE') then
    raise exception 'This video call is not available';
  end if;
  if now() < call_row.available_from_at then
    raise exception 'The call opens 15 minutes before the scheduled time';
  end if;

  update public.video_calls
  set status = 'LIVE', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_call_id
  returning * into call_row;

  return next call_row;
end;
$$;

create or replace function public.video_call_cancel(p_call_id uuid, p_reason text default null)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
  role_name text;
begin
  select * into call_row from public.video_calls where id = p_call_id for update;
  if not found or (call_row.customer_id <> auth.uid() and call_row.owner_id <> auth.uid()) then
    raise exception 'You are not a participant in this video call';
  end if;
  if call_row.status in ('ENDED', 'CANCELLED', 'EXPIRED') then
    return next call_row;
    return;
  end if;

  role_name := case when call_row.owner_id = auth.uid() then 'BUSINESS_OWNER' else 'CUSTOMER' end;
  update public.video_calls
  set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = nullif(left(coalesce(p_reason, ''), 300), ''), updated_at = now()
  where id = p_call_id
  returning * into call_row;

  insert into public.chat_messages (
    conversation_id, sender_id, sender_role, content, message_type, metadata, is_read
  ) values (
    call_row.conversation_id, auth.uid(), role_name, 'Video consultation cancelled', 'video_call',
    jsonb_build_object('video_call_id', call_row.id, 'event', 'cancelled'), false
  );

  return next call_row;
end;
$$;

create or replace function public.video_call_end(p_call_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  call_row public.video_calls%rowtype;
begin
  select * into call_row from public.video_calls where id = p_call_id for update;
  if not found or (call_row.customer_id <> auth.uid() and call_row.owner_id <> auth.uid()) then
    raise exception 'You are not a participant in this video call';
  end if;

  update public.video_calls
  set status = case when status = 'LIVE' then 'ENDED' else status end,
      ended_at = case when status = 'LIVE' then coalesce(ended_at, now()) else ended_at end,
      updated_at = now()
  where id = p_call_id
  returning * into call_row;

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
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.message_type <> 'video_call' then return new; end if;

  event_name := new.metadata->>'event';
  if new.metadata->>'video_call_id' is null or event_name not in ('requested', 'scheduled', 'cancelled') then
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
     or (event_name = 'scheduled' and new.sender_id <> call_row.owner_id) then
    raise exception 'Video call event sender is invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_video_call_message_insert on public.chat_messages;
create trigger guard_video_call_message_insert
before insert on public.chat_messages
for each row execute function public.guard_video_call_message_insert();

revoke all on function public.video_call_request(uuid) from public, anon;
revoke all on function public.video_call_schedule(uuid, timestamptz) from public, anon;
revoke all on function public.video_call_join(uuid) from public, anon;
revoke all on function public.video_call_cancel(uuid, text) from public, anon;
revoke all on function public.video_call_end(uuid) from public, anon;
grant execute on function public.video_call_request(uuid) to authenticated;
grant execute on function public.video_call_schedule(uuid, timestamptz) to authenticated;
grant execute on function public.video_call_join(uuid) to authenticated;
grant execute on function public.video_call_cancel(uuid, text) to authenticated;
grant execute on function public.video_call_end(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_calls'
  ) then
    alter publication supabase_realtime add table public.video_calls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_call_board_events'
  ) then
    alter publication supabase_realtime add table public.video_call_board_events;
  end if;
end $$;

commit;
