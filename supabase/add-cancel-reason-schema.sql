-- Add cancel_reason column to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
