-- ============================================================
-- Profile Phone Number Support
-- Run this in Supabase SQL Editor
-- ============================================================

alter table public.profiles
  add column if not exists phone text;

alter table public.orders
  add column if not exists customer_phone text;
