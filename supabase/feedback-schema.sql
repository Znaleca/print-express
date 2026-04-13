-- ============================================================
-- Customer Feedback & Review System Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add rating and feedback columns to the orders table
alter table public.orders
  add column if not exists rating smallint check (rating >= 1 and rating <= 5),
  add column if not exists feedback text;

-- (Optional) If you wanted to run a backfill, you could set default ratings here.
