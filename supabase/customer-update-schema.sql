-- ============================================================
-- Fix: Allow Customers to Update Their Orders (For Ratings/Feedback)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Customers can update their own orders
create policy "Customers can update their own orders"
on public.orders for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());
