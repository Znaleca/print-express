-- ============================================================
-- SQL Script: Add Delivery & Pickup Options
-- ============================================================

-- Add delivery info columns to the orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_type text check (delivery_type in ('PICKUP', 'DELIVERY')) default 'PICKUP';

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_address text;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_coordinates jsonb;

-- Instructions: Execute this query in your Supabase Dashboard -> SQL Editor 
-- to allow the application to save pick up/delivery options correctly.
