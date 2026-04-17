-- ============================================================
-- Business Minimum Downpayment Schema
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS min_downpayment_percent integer NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'businesses_min_downpayment_percent_check'
  ) THEN
    ALTER TABLE public.businesses
    ADD CONSTRAINT businesses_min_downpayment_percent_check
    CHECK (min_downpayment_percent >= 1 AND min_downpayment_percent <= 100);
  END IF;
END $$;
