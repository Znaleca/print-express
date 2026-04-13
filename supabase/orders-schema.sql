-- ============================================================
-- Order Management Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create the orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users not null,
  business_id uuid references public.businesses(id) not null,
  status text not null default 'PLACED' check (status in ('PLACED', 'PREPARING', 'READY_TO_PICK_UP', 'RIDER_ON_THE_WAY', 'COMPLETED')),
  payment_method text not null check (payment_method in ('COD', 'E-Wallet')),
  total numeric(10,2) not null,
  items jsonb not null default '[]'::jsonb,
  receipt_url text, -- For E-Wallet Proof of Payment
  design_files jsonb not null default '[]'::jsonb, -- Array of URLs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3) Enable RLS
alter table public.orders enable row level security;

-- 4) Policies for Customers
-- Customers can read their own orders
create policy "Customers can view their own orders"
on public.orders for select
to authenticated
using (customer_id = auth.uid());

-- Customers can insert their own orders
create policy "Customers can insert their own orders"
on public.orders for insert
to authenticated
with check (customer_id = auth.uid());

-- 5) Policies for Business Owners
-- Owners can read orders assigned to their business
create policy "Owners can view their bound orders"
on public.orders for select
to authenticated
using (
  business_id in (select id from public.businesses where owner_id = auth.uid())
);

-- Owners can update orders assigned to their business (for updating statuses)
create policy "Owners can update their bound orders"
on public.orders for update
to authenticated
using (
  business_id in (select id from public.businesses where owner_id = auth.uid())
);

-- 6) Setup updated_at trigger
create extension if not exists moddatetime schema extensions;
drop trigger if exists handle_updated_at on public.orders;
create trigger handle_updated_at before update on public.orders
  for each row execute procedure moddatetime (updated_at);
