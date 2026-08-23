-- ============================================================
-- Customer Feedback & Review System Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add rating and feedback columns to the orders table
alter table public.orders
  add column if not exists rating smallint check (rating >= 1 and rating <= 5),
  add column if not exists feedback text;

alter table public.orders
  drop constraint if exists orders_feedback_only_after_completed;

alter table public.orders
  add constraint orders_feedback_only_after_completed
  check (
    status in ('COMPLETED', 'DELIVERY_COMPLETED')
    or (
      rating is null
      and (feedback is null or length(trim(feedback)) = 0)
    )
  )
  not valid;

-- (Optional) If you wanted to run a backfill, you could set default ratings here.
