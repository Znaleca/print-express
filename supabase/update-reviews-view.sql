-- ============================================================
-- Update Public View to Include Customer Name
-- Run this in Supabase SQL Editor
-- ============================================================

-- Recreate the view with a join to profiles to fetch the customer's name
create or replace view public.business_reviews as
select 
  o.id as order_id,
  o.business_id,
  o.rating,
  o.feedback,
  o.created_at,
  p.full_name as customer_name
from public.orders o
left join public.profiles p on o.customer_id = p.id
where o.status = 'COMPLETED' and o.rating is not null;

-- Grant access to public roles
grant select on public.business_reviews to anon, authenticated;
