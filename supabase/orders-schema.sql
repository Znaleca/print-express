-- ============================================================
-- Order Management Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create the orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users not null,
  business_id uuid references public.businesses(id) not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PLACED', 'PREPARING', 'READY_TO_PICK_UP', 'RIDER_ON_THE_WAY', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_CONFIRMED')),
  payment_method text not null check (payment_method in ('COD', 'E-Wallet')),
  total numeric(10,2) not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  receipt_url text, -- For E-Wallet Proof of Payment
  cancel_reason text,
  cancelled_at timestamp with time zone,
  refund_proof_url text,
  refund_receipt_url text,
  refund_reason text,
  refund_requested_at timestamp with time zone,
  refunded_at timestamp with time zone,
  downpayment_amount numeric(10,2) default 0,
  balance_amount numeric(10,2) default 0,
  fully_paid boolean default false,
  design_files jsonb not null default '[]'::jsonb, -- Array of URLs
  quotation_valid_until timestamp with time zone,
  quotation_terms text,
  tax_amount numeric(10,2) default 0,
  discount_amount numeric(10,2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists quotation_valid_until timestamp with time zone;
alter table public.orders add column if not exists quotation_terms text;
alter table public.orders add column if not exists tax_amount numeric(10,2) default 0;
alter table public.orders add column if not exists discount_amount numeric(10,2) default 0;

-- 3) Enable RLS
alter table public.orders enable row level security;

-- 4) Policies for Customers
-- Customers can read their own orders
drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Customers can view their own orders"
on public.orders for select
to authenticated
using (customer_id = auth.uid());

-- Customers can insert their own orders
drop policy if exists "Customers can insert their own orders" on public.orders;
create policy "Customers can insert their own orders"
on public.orders for insert
to authenticated
with check (customer_id = auth.uid());

-- 5) Policies for Business Owners
-- Owners can read orders assigned to their business
drop policy if exists "Owners can view their bound orders" on public.orders;
create policy "Owners can view their bound orders"
on public.orders for select
to authenticated
using (
  business_id in (select id from public.businesses where owner_id = auth.uid())
);

-- Owners can update orders assigned to their business (for updating statuses)
drop policy if exists "Owners can update their bound orders" on public.orders;
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
