-- Keep review reads on the completed order row, which is the single source of
-- truth for ratings, feedback, and moderation state.
begin;

alter table public.orders
  add column if not exists feedback_hidden boolean default false,
  add column if not exists feedback_hidden_at timestamptz,
  add column if not exists feedback_hidden_by text;

-- Owners may moderate visibility for their own shop, but must not be able to
-- rewrite a customer's rating or feedback through the broad order policy.
create or replace function public.prevent_owner_order_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  protected_old jsonb;
  protected_new jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from public.businesses b
    where b.id = old.business_id and b.owner_id = caller
  ) then
    protected_old := to_jsonb(old) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url', 'fully_paid',
      'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url', 'fully_paid',
      'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Owners cannot change protected order fields';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_owner_order_tampering() from public;
drop trigger if exists prevent_owner_order_tampering on public.orders;
create trigger prevent_owner_order_tampering
before update on public.orders
for each row execute function public.prevent_owner_order_tampering();

drop view if exists public.visible_business_reviews;
drop view if exists public.business_reviews;

-- Internal/server-side DTO source. The app's public clients use the filtered
-- view below, so hidden review state is never exposed to anonymous visitors.
create view public.business_reviews as
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
  case
    when jsonb_typeof(o.items::jsonb) = 'array' and jsonb_array_length(o.items::jsonb) > 0
      then (o.items::jsonb -> 0 ->> 'name')
    else null
  end as item_name
from public.orders o
left join public.profiles p on p.id = o.customer_id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null;

-- Public review feed: only completed, rated, non-hidden reviews and only the
-- fields needed by customer-facing shop pages.
create view public.visible_business_reviews as
select
  order_id,
  business_id,
  rating,
  feedback,
  created_at,
  customer_name,
  item_name
from public.business_reviews
where feedback_hidden = false;

revoke all on public.business_reviews from anon, authenticated;
grant select on public.business_reviews to service_role;
grant select on public.visible_business_reviews to anon, authenticated;

create index if not exists orders_business_review_visibility_idx
  on public.orders (business_id, feedback_hidden, created_at desc)
  where rating is not null and status in ('COMPLETED', 'DELIVERY_COMPLETED');

commit;
