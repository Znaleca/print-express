-- ============================================================
-- Refund Receipt Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Update status constraint to include REFUND_PENDING
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
    'REFUNDED'
  ));

-- 2) Add refund_receipt_url column (where customer uploads their proof)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_receipt_url TEXT;

-- 3) Allow customers to update their OWN order's refund_receipt_url and status
--    (needed so they can upload a receipt and flip to REFUND_PENDING)
DROP POLICY IF EXISTS "Customers can update refund fields on own orders" ON public.orders;
CREATE POLICY "Customers can update refund fields on own orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid());

-- ============================================================
-- Storage bucket for refund receipts
-- Run these in Supabase SQL Editor (Storage section)
-- ============================================================

-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('refund-receipts', 'refund-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Customers can upload their own receipts
DROP POLICY IF EXISTS "Customers can upload refund receipts" ON storage.objects;
CREATE POLICY "Customers can upload refund receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'refund-receipts');

-- Anyone authenticated can read (owners need to see them)
DROP POLICY IF EXISTS "Authenticated users can read refund receipts" ON storage.objects;
CREATE POLICY "Authenticated users can read refund receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'refund-receipts');

-- Customers can update/replace their own receipts
DROP POLICY IF EXISTS "Customers can update their own receipts" ON storage.objects;
CREATE POLICY "Customers can update their own receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'refund-receipts');
