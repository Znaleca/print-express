-- ============================================================
-- Shop Management Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Extend businesses table with rich profile fields
alter table public.businesses
  add column if not exists description   text,
  add column if not exists address       text,
  add column if not exists phone         text,
  add column if not exists email         text,
  add column if not exists logo_url      text,
  add column if not exists website       text,
  add column if not exists updated_at    timestamptz default now();

-- 2) Create services table
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  price       numeric(10,2) not null default 0,
  category    text,
  available   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 3) RLS for services
alter table public.services enable row level security;

-- Owner can do full CRUD on their own services
drop policy if exists "Owners manage own services" on public.services;
create policy "Owners manage own services"
on public.services
for all
to authenticated
using (
  business_id in (
    select id from public.businesses where owner_id = auth.uid()
  )
)
with check (
  business_id in (
    select id from public.businesses where owner_id = auth.uid()
  )
);

-- Everyone can read services of approved businesses
drop policy if exists "Public read approved services" on public.services;
create policy "Public read approved services"
on public.services
for select
using (
  business_id in (
    select id from public.businesses where status = 'APPROVED'
  )
);

-- 4) Owner can update and read their own business
drop policy if exists "Owners can update own business" on public.businesses;
create policy "Owners can update own business"
on public.businesses
for update
to authenticated
using  (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners can read own business" on public.businesses;
create policy "Owners can read own business"
on public.businesses
for select
to authenticated
using (owner_id = auth.uid());
