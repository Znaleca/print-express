-- ============================================================
-- Add QR Payment Image column to businesses table
-- Run this in Supabase SQL Editor
-- ============================================================

alter table public.businesses
  add column if not exists qr_url text;
