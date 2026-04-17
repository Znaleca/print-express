-- ============================================================
-- Add Downpayment Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add downpayment_amount and balance_amount to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS downpayment_amount numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS balance_amount numeric(10,2) DEFAULT 0;

-- Update the existing rows to just have balance = total, downpayment = 0 (or null)
UPDATE public.orders SET downpayment_amount = 0, balance_amount = total WHERE downpayment_amount IS NULL;
