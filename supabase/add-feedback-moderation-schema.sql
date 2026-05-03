-- ============================================================
-- Add feedback moderation fields to orders
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS feedback_hidden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS feedback_hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_hidden_by TEXT; -- 'owner' or 'admin'

-- Drop existing view first to avoid column conflict errors
DROP VIEW IF EXISTS public.business_reviews;

-- Recreate the view to:
--  1. Expose item_name (first item in the order)
--  2. Include feedback_hidden flag for moderation
CREATE VIEW public.business_reviews AS
SELECT
  o.id                                        AS order_id,
  o.business_id,
  o.rating,
  o.feedback,
  o.feedback_hidden,
  o.feedback_hidden_at,
  o.feedback_hidden_by,
  o.created_at,
  p.full_name                                 AS customer_name,
  -- Pull the name of the first purchased item
  CASE
    WHEN jsonb_array_length(o.items::jsonb) > 0
    THEN (o.items::jsonb -> 0 ->> 'name')
    ELSE NULL
  END                                         AS item_name
FROM public.orders o
LEFT JOIN public.profiles p ON o.customer_id = p.id
WHERE o.status = 'COMPLETED'
  AND o.rating IS NOT NULL;

-- Grant access
GRANT SELECT ON public.business_reviews TO anon, authenticated;

