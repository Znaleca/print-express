-- Supporting indexes for the Admin shop-grouped category and review workflows.
begin;

create index if not exists category_approval_requests_business_status_created_idx
  on public.category_approval_requests (business_id, status, created_at desc);

create index if not exists orders_business_review_created_idx
  on public.orders (business_id, status, created_at desc)
  where rating is not null;

create index if not exists orders_feedback_visibility_idx
  on public.orders (feedback_hidden, created_at desc)
  where rating is not null;

commit;
