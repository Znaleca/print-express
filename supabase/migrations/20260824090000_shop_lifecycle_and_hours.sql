-- Press & Present shop lifecycle and operating-hours foundation.
--
-- This migration is intentionally additive. It introduces the data model for
-- the later lifecycle/RLS/checkout changes, but does not yet change public
-- visibility or automatically lock shops.

begin;

-- -------------------------------------------------------------------------
-- Shop lifecycle is separate from business approval.
-- businesses.status remains the approval state:
-- PENDING, APPROVED, REJECTED.
-- -------------------------------------------------------------------------
alter table public.businesses
  add column if not exists lifecycle_state text not null default 'ACTIVE',
  add column if not exists last_activity_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references auth.users(id) on delete set null,
  add column if not exists lock_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists timezone text not null default 'Asia/Manila',
  add column if not exists manual_open_override boolean,
  add column if not exists manual_override_until timestamptz;

-- Existing installations already have updated_at through the shop profile
-- migration. Backfill activity from the most reliable existing timestamps so
-- the first scheduler run does not treat every shop as newly active.
update public.businesses
set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;

alter table public.businesses
  alter column last_activity_at set default now(),
  alter column last_activity_at set not null;

alter table public.businesses
  drop constraint if exists businesses_lifecycle_state_check;

alter table public.businesses
  add constraint businesses_lifecycle_state_check
  check (lifecycle_state in ('ACTIVE', 'LOCKED', 'ARCHIVED'));

create index if not exists businesses_lifecycle_activity_idx
  on public.businesses (lifecycle_state, status, last_activity_at);

-- -------------------------------------------------------------------------
-- Configurable inactivity period. The singleton row defaults to seven days.
-- -------------------------------------------------------------------------
create table if not exists public.shop_lifecycle_settings (
  singleton boolean primary key default true check (singleton),
  inactivity_days integer not null default 7
    check (inactivity_days between 1 and 3650),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.shop_lifecycle_settings (singleton, inactivity_days)
values (true, 7)
on conflict (singleton) do nothing;

alter table public.shop_lifecycle_settings enable row level security;

-- -------------------------------------------------------------------------
-- Weekly operating hours. A missing row will be treated as not configured by
-- the later effective-open-state function; this migration does not alter the
-- current is_open behavior yet.
-- -------------------------------------------------------------------------
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, day_of_week),
  check (
    is_closed
    or (opens_at is not null and closes_at is not null and opens_at <> closes_at)
  )
);

create index if not exists business_hours_business_day_idx
  on public.business_hours (business_id, day_of_week);

alter table public.business_hours enable row level security;

commit;
