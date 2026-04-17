-- ============================================================
-- Orders Fulfillment Schedule Schema
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'NEED_NOW';

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS expected_fulfillment_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_fulfillment_mode_check'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_fulfillment_mode_check
    CHECK (fulfillment_mode IN ('NEED_NOW', 'ADVANCE'));
  END IF;
END $$;
