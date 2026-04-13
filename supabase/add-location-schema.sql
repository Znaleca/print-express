-- ============================================================
-- Add Location to Businesses
-- Run this in Supabase SQL Editor
-- ============================================================

alter table public.businesses
  add column if not exists lat numeric(10, 6),
  add column if not exists lng numeric(10, 6);
