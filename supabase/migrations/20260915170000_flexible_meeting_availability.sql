-- Flexible owner-controlled meeting availability: a 20-minute default notice,
-- custom slot spacing, and per-date open/blocked overrides.

begin;

alter table public.businesses
  alter column meeting_min_notice_minutes set default 20;

alter table public.businesses
  drop constraint if exists businesses_meeting_notice_check,
  drop constraint if exists businesses_meeting_interval_check;

update public.businesses
set meeting_min_notice_minutes = 20
where meeting_min_notice_minutes = 30;

alter table public.businesses
  add constraint businesses_meeting_notice_check
    check (meeting_min_notice_minutes between 5 and 10080),
  add constraint businesses_meeting_interval_check
    check (meeting_slot_interval_minutes between 5 and 120);

create table if not exists public.business_meeting_date_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  available_date date not null,
  is_available boolean not null default false,
  opens_at time,
  closes_at time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, available_date),
  constraint business_meeting_date_override_window_check check (
    (is_available is false and opens_at is null and closes_at is null)
    or (is_available is true and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create index if not exists business_meeting_date_overrides_lookup_idx
  on public.business_meeting_date_overrides (business_id, available_date);

alter table public.business_meeting_date_overrides enable row level security;

drop policy if exists "Owners can view meeting date overrides" on public.business_meeting_date_overrides;
create policy "Owners can view meeting date overrides"
on public.business_meeting_date_overrides for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_meeting_date_overrides.business_id and (b.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Owners can create meeting date overrides" on public.business_meeting_date_overrides;
create policy "Owners can create meeting date overrides"
on public.business_meeting_date_overrides for insert to authenticated
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_meeting_date_overrides.business_id and (b.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Owners can update meeting date overrides" on public.business_meeting_date_overrides;
create policy "Owners can update meeting date overrides"
on public.business_meeting_date_overrides for update to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_meeting_date_overrides.business_id and (b.owner_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_meeting_date_overrides.business_id and (b.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Owners can delete meeting date overrides" on public.business_meeting_date_overrides;
create policy "Owners can delete meeting date overrides"
on public.business_meeting_date_overrides for delete to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_meeting_date_overrides.business_id and (b.owner_id = auth.uid() or public.is_admin())
  )
);

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
  override_row public.business_meeting_date_overrides%rowtype;
  target_local timestamp;
  target_date date;
  target_day integer;
  target_minutes integer;
  target_end_minutes integer;
  previous_day integer;
  override_open_minutes integer;
  override_close_minutes integer;
begin
  if p_scheduled_at is null then raise exception 'Choose a meeting time'; end if;

  select * into business_row from public.businesses where id = p_business_id;
  if not found or business_row.meeting_enabled is not true then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if business_row.status <> 'APPROVED' or business_row.lifecycle_state <> 'ACTIVE' then
    raise exception 'This shop is not currently accepting online meetings';
  end if;
  if p_scheduled_at < now() + make_interval(mins => greatest(5, coalesce(business_row.meeting_min_notice_minutes, 20))) then
    raise exception 'Choose a time after the shop minimum notice period';
  end if;
  if p_scheduled_at > now() + make_interval(days => business_row.meeting_max_days_ahead) then
    raise exception 'Choose a time within the shop booking window';
  end if;

  target_local := p_scheduled_at at time zone coalesce(nullif(business_row.timezone, ''), 'Asia/Manila');
  target_date := target_local::date;
  target_day := extract(dow from target_local)::integer;
  previous_day := (target_day + 6) % 7;
  target_minutes := extract(hour from target_local)::integer * 60 + extract(minute from target_local)::integer;
  target_end_minutes := target_minutes + business_row.meeting_duration_minutes;

  select * into override_row
  from public.business_meeting_date_overrides
  where business_id = p_business_id and available_date = target_date;

  if found then
    if override_row.is_available is not true then
      raise exception 'The shop blocked this date';
    end if;
    override_open_minutes := extract(hour from override_row.opens_at)::integer * 60 + extract(minute from override_row.opens_at)::integer;
    override_close_minutes := extract(hour from override_row.closes_at)::integer * 60 + extract(minute from override_row.closes_at)::integer;
    if target_minutes < override_open_minutes
       or target_end_minutes > override_close_minutes
       or mod(target_minutes - override_open_minutes, business_row.meeting_slot_interval_minutes) <> 0 then
      raise exception 'Choose a published time for this date';
    end if;
  elsif not exists (
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
          and mod(target_minutes - (extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer), business_row.meeting_slot_interval_minutes) = 0
        )
        or (
          h.day_of_week = target_day
          and h.opens_at > h.closes_at
          and target_minutes >= extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer
          and target_end_minutes <= 1440 + extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
          and mod(target_minutes - (extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer), business_row.meeting_slot_interval_minutes) = 0
        )
        or (
          h.day_of_week = previous_day
          and h.opens_at > h.closes_at
          and target_minutes < extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
          and target_end_minutes <= extract(hour from h.closes_at)::integer * 60 + extract(minute from h.closes_at)::integer
          and mod(target_minutes + 1440 - (extract(hour from h.opens_at)::integer * 60 + extract(minute from h.opens_at)::integer), business_row.meeting_slot_interval_minutes) = 0
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

revoke all on function public.validate_video_call_slot(uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_video_call_slot(uuid, timestamptz, uuid)
  to service_role;

commit;
