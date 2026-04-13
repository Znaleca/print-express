-- ============================================================
-- Create a Public View for Reviews (Bypassing Order RLS)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create the view
create or replace view public.business_reviews as
select 
  id as order_id,
  business_id,
  rating,
  feedback,
  created_at
from public.orders
where status = 'COMPLETED' and rating is not null;

-- 2) Grant access to public roles
grant select on public.business_reviews to anon, authenticated;
