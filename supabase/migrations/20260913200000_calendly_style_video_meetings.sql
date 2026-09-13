-- Calendly-style meeting availability, booking, rescheduling, and notification claims.
-- Existing video-call rows remain valid; new booking fields are snapshots so later
-- shop-setting changes do not alter an already booked meeting.

begin;

create extension if not exists btree_gist;

alter table if exists public.businesses
  add column if not exists meeting_enabled boolean not null default true,
  add column if not exists meeting_duration_minutes smallint not null default 30,
  add column if not exists meeting_buffer_minutes smallint not null default 15,
  add column if not exists meeting_min_notice_minutes integer not null default 60,
  add column if not exists meeting_max_days_ahead integer not null default 30,
  add column if not exists meeting_slot_interval_minutes smallint not null default 30,
  add column if not exists meeting_requires_approval boolean not null default false;

alter table if exists public.businesses
  drop constraint if exists businesses_meeting_duration_check,
  drop constraint if exists businesses_meeting_buffer_check,
  drop constraint if exists businesses_meeting_notice_check,
  drop constraint if exists businesses_meeting_window_check,
  drop constraint if exists businesses_meeting_interval_check;

alter table if exists public.businesses
  add constraint businesses_meeting_duration_check check (meeting_duration_minutes in (15, 30, 45, 60)),
  add constraint businesses_meeting_buffer_check check (meeting_buffer_minutes between 0 and 240),
  add constraint businesses_meeting_notice_check check (meeting_min_notice_minutes between 0 and 10080),
  add constraint businesses_meeting_window_check check (meeting_max_days_ahead between 1 and 180),
  add constraint businesses_meeting_interval_check check (meeting_slot_interval_minutes in (15, 30, 60));

alter table if exists public.video_calls
  add column if not exists requested_slot_at timestamptz,
  add column if not exists duration_minutes smallint not null default 30,
  add column if not exists buffer_minutes smallint not null default 15,
  add column if not exists customer_note text,
  add column if not exists booking_timezone text,
  add column if not exists rescheduled_from_at timestamptz,
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists meeting_slot tstzrange;

update public.video_calls
set requested_slot_at = coalesce(requested_slot_at, scheduled_at)
where requested_slot_at is null and scheduled_at is not null;

alter table if exists public.video_calls
  drop constraint if exists video_calls_duration_check,
  drop constraint if exists video_calls_buffer_check,
  drop constraint if exists video_calls_reschedule_count_check;

alter table if exists public.video_calls
  add constraint video_calls_duration_check check (duration_minutes between 15 and 120),
  add constraint video_calls_buffer_check check (buffer_minutes between 0 and 240),
  add constraint video_calls_reschedule_count_check check (reschedule_count >= 0);

create unique index if not exists video_calls_one_open_per_conversation_idx
  on public.video_calls (conversation_id)
  where status in ('REQUESTED', 'SCHEDULED', 'LIVE');

create or replace function public.sync_video_call_meeting_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  slot_start timestamptz;
begin
  slot_start := coalesce(new.scheduled_at, new.requested_slot_at);
  if new.status in ('REQUESTED', 'SCHEDULED', 'LIVE') and slot_start is not null then
    new.meeting_slot := tstzrange(
      slot_start,
      slot_start + interval '1 minute' * (new.duration_minutes + new.buffer_minutes),
      '[)'
    );
  else
    new.meeting_slot := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_video_call_meeting_slot on public.video_calls;
create trigger sync_video_call_meeting_slot
before insert or update of status, scheduled_at, requested_slot_at, duration_minutes, buffer_minutes
on public.video_calls
for each row execute function public.sync_video_call_meeting_slot();

update public.video_calls vc
set meeting_slot = tstzrange(
  coalesce(vc.scheduled_at, vc.requested_slot_at),
  coalesce(vc.scheduled_at, vc.requested_slot_at)
    + interval '1 minute' * (vc.duration_minutes + vc.buffer_minutes),
  '[)'
)
where vc.status in ('REQUESTED', 'SCHEDULED', 'LIVE')
  and coalesce(vc.scheduled_at, vc.requested_slot_at) is not null;

alter table public.video_calls
  drop constraint if exists video_calls_no_overlapping_business_slots;
alter table public.video_calls
  add constraint video_calls_no_overlapping_business_slots
  exclude using gist (
    business_id with =,
    meeting_slot with &&
  ) where (
    status in ('REQUESTED', 'SCHEDULED', 'LIVE')
    and meeting_slot is not null
  );

create index if not exists video_calls_business_slot_idx
  on public.video_calls (business_id, requested_slot_at, status);

create table if not exists public.video_call_email_events (
  id uuid primary key default gen_random_uuid(),
  video_call_id uuid not null references public.video_calls(id) on delete cascade,
  event_key text not null unique,
  event_type text not null check (event_type in ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED')),
  version integer not null default 1,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_call_email_events_call_idx
  on public.video_call_email_events (video_call_id, created_at desc);

alter table public.video_call_email_events enable row level security;
revoke all on table public.video_call_email_events from public, anon, authenticated;

create or replace function public.claim_video_call_email(
  p_event_key text,
  p_call_id uuid,
  p_event_type text,
  p_version integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the notification service can claim email events';
  end if;

  insert into public.video_call_email_events (video_call_id, event_key, event_type, version)
  values (p_call_id, left(p_event_key, 240), p_event_type, greatest(1, p_version))
  on conflict (event_key) do update
  set status = 'PROCESSING',
      attempts = public.video_call_email_events.attempts + 1,
      claimed_at = now(),
      updated_at = now(),
      last_error = null
  where public.video_call_email_events.status <> 'SENT'
    and (
      public.video_call_email_events.status = 'FAILED'
      or public.video_call_email_events.claimed_at < now() - interval '10 minutes'
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_video_call_email(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_video_call_email(text, uuid, text, integer) to service_role;

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
  if p_scheduled_at < now() + make_interval(mins => business_row.meeting_min_notice_minutes) then
    raise exception 'Choose a time after the shop minimum notice period';
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

revoke all on function public.validate_video_call_slot(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.validate_video_call_slot(uuid, timestamptz, uuid) to service_role;

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
          booking_timezone = coalesce(nullif(left(p_timezone, 80), ''), nullif(business_row.timezone, ''), 'Asia/Manila'),
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
    conversation_row.id, business_row.id, conversation_row.customer_id, business_row.owner_id,
    next_status, 'pp-call-' || replace(gen_random_uuid()::text, '-', ''),
    p_scheduled_at,
    case when next_status = 'SCHEDULED' then p_scheduled_at else null end,
    case when next_status = 'SCHEDULED' then p_scheduled_at - interval '15 minutes' else null end,
    case when next_status = 'SCHEDULED' then p_scheduled_at + make_interval(mins => greatest(30, business_row.meeting_duration_minutes)) else null end,
    business_row.meeting_duration_minutes, business_row.meeting_buffer_minutes,
    nullif(left(coalesce(p_customer_note, ''), 500), ''),
    coalesce(nullif(left(p_timezone, 80), ''), nullif(business_row.timezone, ''), 'Asia/Manila')
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

create or replace function public.video_call_confirm(p_call_id uuid)
returns setof public.video_calls
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.video_call_reschedule(p_call_id, (select requested_slot_at from public.video_calls where id = p_call_id), null, true);
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
begin
  return query select * from public.video_call_reschedule(p_call_id, p_scheduled_at, null, true);
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
  if new.metadata->>'video_call_id' is null or event_name not in ('requested', 'scheduled', 'rescheduled', 'cancelled') then
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
     or (event_name = 'rescheduled' and new.sender_id not in (call_row.customer_id, call_row.owner_id)) then
    raise exception 'Video call event sender is invalid';
  end if;
  return new;
end;
$$;

revoke all on function public.video_call_book(uuid, timestamptz, text, text) from public, anon;
revoke all on function public.video_call_confirm(uuid) from public, anon;
revoke all on function public.video_call_reschedule(uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.video_call_book(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.video_call_confirm(uuid) to authenticated;
grant execute on function public.video_call_reschedule(uuid, timestamptz, text, boolean) to authenticated;

commit;
