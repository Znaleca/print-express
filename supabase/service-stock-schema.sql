-- ============================================================
-- Service Stock Schema
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_stock_qty_nonnegative;

ALTER TABLE public.services
  ADD CONSTRAINT services_stock_qty_nonnegative CHECK (stock_qty >= 0);
