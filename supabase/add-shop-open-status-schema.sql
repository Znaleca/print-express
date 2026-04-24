-- ============================================================
-- Add is_open (shop open/close toggle) to businesses table
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;
