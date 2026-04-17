-- ============================================================
-- Update Refund Flow & Completed Status Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Update status constraint to include REFUND_CONFIRMED
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'PENDING',
    'PLACED',
    'PREPARING',
    'READY_TO_PICK_UP',
    'RIDER_ON_THE_WAY',
    'COMPLETED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED',
    'REFUND_CONFIRMED'
  ));

-- 2) Add fully_paid boolean column to track completion of payments
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fully_paid BOOLEAN DEFAULT false;

-- update existing COMPLETED orders to be fully_paid = true
UPDATE public.orders SET fully_paid = true, balance_amount = 0 WHERE status = 'COMPLETED';

