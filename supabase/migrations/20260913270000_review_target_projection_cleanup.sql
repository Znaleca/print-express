-- Do not infer a review target from the first item in an order. Historical
-- order-level reviews stay order-level until a real target is selected.
begin;

update public.visible_business_reviews_data data
set item_name = services.name,
    review_target_name = services.name,
    review_target_type = services.item_type
from public.orders
left join public.services on services.id = orders.review_service_id
where orders.id = data.order_id;

create or replace view public.business_reviews
with (security_invoker = true)
as
select
  o.id as order_id,
  o.business_id,
  o.customer_id,
  o.rating,
  o.feedback,
  coalesce(o.feedback_hidden, false) as feedback_hidden,
  o.feedback_hidden_at,
  o.feedback_hidden_by,
  o.created_at,
  p.full_name as customer_name,
  s.name as item_name,
  o.review_service_id
from public.orders o
left join public.profiles p on p.id = o.customer_id
left join public.services s on s.id = o.review_service_id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null;

commit;
