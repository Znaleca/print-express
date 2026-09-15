-- Customers can review every distinct product or service in a completed order.
-- Legacy one-review-per-order rows remain supported for existing history.
begin;

create table if not exists public.order_item_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  item_name text not null,
  item_type text,
  rating smallint not null check (rating between 1 and 5),
  feedback text,
  feedback_masked text,
  feedback_hidden boolean not null default false,
  feedback_hidden_at timestamptz,
  feedback_hidden_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, service_id)
);

create index if not exists order_item_reviews_business_idx
  on public.order_item_reviews (business_id, created_at desc);
create index if not exists order_item_reviews_customer_idx
  on public.order_item_reviews (customer_id, created_at desc);

create or replace function public.project_order_item_review_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.feedback_masked := public.mask_review_text(new.feedback);
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.project_order_item_review_text() from public, anon, authenticated;
drop trigger if exists project_order_item_review_text on public.order_item_reviews;
create trigger project_order_item_review_text
before insert or update of rating, feedback on public.order_item_reviews
for each row execute function public.project_order_item_review_text();

alter table public.order_item_reviews enable row level security;
revoke all on public.order_item_reviews from public, anon, authenticated;
grant select on public.order_item_reviews to anon, authenticated;

drop policy if exists "Customers can read their item reviews" on public.order_item_reviews;
create policy "Customers can read their item reviews"
on public.order_item_reviews for select to authenticated
using (customer_id = auth.uid());

drop policy if exists "Public can read visible item reviews" on public.order_item_reviews;
create policy "Public can read visible item reviews"
on public.order_item_reviews for select to anon, authenticated
using (
  feedback_hidden = false
  and public.is_business_customer_visible(business_id)
);

create or replace view public.visible_order_item_reviews
with (security_invoker = true)
as
select
  r.id as review_id,
  r.order_id,
  r.business_id,
  r.rating,
  r.feedback_masked as feedback,
  r.created_at,
  'Verified Customer'::text as customer_name,
  r.item_name,
  r.service_id as review_service_id,
  r.item_name as review_target_name,
  r.item_type as review_target_type
from public.order_item_reviews r
where r.feedback_hidden = false;

revoke all on public.visible_order_item_reviews from public, anon, authenticated;
grant select on public.visible_order_item_reviews to anon, authenticated;

alter table public.review_moderation_requests
  add column if not exists review_id uuid references public.order_item_reviews(id) on delete cascade;

drop index if exists public.review_moderation_requests_one_pending_idx;
create unique index if not exists review_moderation_requests_one_pending_order_idx
  on public.review_moderation_requests(order_id)
  where status = 'PENDING' and review_id is null;
create unique index if not exists review_moderation_requests_one_pending_item_idx
  on public.review_moderation_requests(review_id)
  where status = 'PENDING' and review_id is not null;

create or replace function public.request_item_review_removal(
  p_review_id uuid,
  p_reason text,
  p_requester_id uuid default null
)
returns public.review_moderation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  review_row public.order_item_reviews%rowtype;
  business_owner uuid;
  request_row public.review_moderation_requests;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from caller then raise exception 'Requester identity mismatch'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required'; end if;

  select r.* into review_row
  from public.order_item_reviews r
  where r.id = p_review_id
  for update of r;
  if not found then raise exception 'Review not found'; end if;

  select owner_id into business_owner
  from public.businesses
  where id = review_row.business_id;
  if business_owner is distinct from caller then raise exception 'Review not found'; end if;
  if exists (select 1 from public.review_moderation_requests where review_id = p_review_id and status = 'PENDING') then
    raise exception 'A pending removal request already exists for this review';
  end if;

  insert into public.review_moderation_requests (order_id, business_id, owner_id, review_id, reason)
  values (review_row.order_id, review_row.business_id, caller, review_row.id, trim(p_reason))
  returning * into request_row;

  insert into public.review_moderation_history (request_id, order_id, business_id, action, note, actor_id)
  values (request_row.id, request_row.order_id, request_row.business_id, 'REQUESTED', request_row.reason, caller);
  return request_row;
end;
$$;

revoke all on function public.request_item_review_removal(uuid, text, uuid) from public, anon;
grant execute on function public.request_item_review_removal(uuid, text, uuid) to authenticated;

create or replace function public.moderate_review_removal(
  p_request_id uuid,
  p_status text,
  p_response text default null,
  p_requester_id uuid default null
)
returns public.review_moderation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  request_row public.review_moderation_requests;
  next_status text := upper(trim(coalesce(p_status, '')));
begin
  if caller is null then raise exception 'Admin access required'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from caller then raise exception 'Requester identity mismatch'; end if;
  if not exists (select 1 from public.profiles where id = caller and role = 'ADMIN') then raise exception 'Admin access required'; end if;
  if next_status not in ('APPROVED', 'REJECTED') then raise exception 'Invalid moderation status'; end if;

  select * into request_row from public.review_moderation_requests where id = p_request_id for update;
  if not found then raise exception 'Moderation request not found'; end if;
  if request_row.status <> 'PENDING' then raise exception 'This request has already been reviewed'; end if;

  if next_status = 'APPROVED' then
    if request_row.review_id is not null then
      update public.order_item_reviews
      set feedback_hidden = true, feedback_hidden_at = now(), feedback_hidden_by = 'admin', updated_at = now()
      where id = request_row.review_id;
    else
      update public.orders
      set feedback_hidden = true, feedback_hidden_at = now(), feedback_hidden_by = 'admin'
      where id = request_row.order_id;
    end if;
  end if;

  update public.review_moderation_requests
  set status = next_status,
      admin_response = nullif(trim(coalesce(p_response, '')), ''),
      reviewed_by = caller,
      reviewed_at = now(),
      updated_at = now()
  where id = request_row.id
  returning * into request_row;

  insert into public.review_moderation_history (request_id, order_id, business_id, action, note, actor_id)
  values (request_row.id, request_row.order_id, request_row.business_id, next_status, request_row.admin_response, caller);
  return request_row;
end;
$$;

revoke all on function public.moderate_review_removal(uuid, text, text, uuid) from public, anon;
grant execute on function public.moderate_review_removal(uuid, text, text, uuid) to authenticated;

commit;
