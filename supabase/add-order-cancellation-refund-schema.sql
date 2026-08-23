-- Add cancellation and refund fields used by the customer and owner order flows.
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS refund_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS downpayment_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fully_paid BOOLEAN DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
CHECK (status IN (
  'PENDING',
  'PLACED',
  'PREPARING',
  'READY_TO_PICK_UP',
  'RIDER_ON_THE_WAY',
  'DELIVERY_COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_CONFIRMED'
));

ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'PENDING';

UPDATE public.orders
SET fully_paid = true, balance_amount = 0
WHERE status IN ('COMPLETED', 'DELIVERY_COMPLETED') AND fully_paid IS DISTINCT FROM true;

DROP POLICY IF EXISTS "Customers can update cancellation and refund fields on own orders" ON public.orders;
CREATE POLICY "Customers can update cancellation and refund fields on own orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());
