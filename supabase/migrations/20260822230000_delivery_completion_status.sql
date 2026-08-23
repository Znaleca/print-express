-- Delivery orders finish at DELIVERY_COMPLETED; pickup orders continue to
-- finish at COMPLETED. Reviews are permitted after either valid completion.

begin;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
check (status in (
  'PENDING',
  'PLACED',
  'PREPARING',
  'READY_TO_PICK_UP',
  'RIDER_ON_THE_WAY',
  'DELIVERY_COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_CONFIRMED'
));

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
  ) not valid;

create or replace function public.prevent_customer_order_tampering()
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

  if caller = old.customer_id then
    protected_old := to_jsonb(old) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'rating', 'feedback'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'rating', 'feedback'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Customers cannot change protected order fields';
    end if;

    if new.status is distinct from old.status then
      if new.status = 'CANCELLED' then
        if old.status not in ('PENDING', 'PLACED', 'PREPARING') then
          raise exception 'This order can no longer be cancelled';
        end if;
      elsif new.status = 'REFUND_PENDING' then
        if old.status <> 'CANCELLED' then
          raise exception 'A refund can only be requested for a cancelled order';
        end if;
      elsif new.status = 'REFUND_CONFIRMED' then
        if old.status <> 'REFUNDED' then
          raise exception 'Refund confirmation is not available yet';
        end if;
      else
        raise exception 'Customers cannot set this order status';
      end if;
    end if;

    if old.status not in ('COMPLETED', 'DELIVERY_COMPLETED')
       and (new.rating is distinct from old.rating or new.feedback is distinct from old.feedback) then
      raise exception 'Reviews can only be submitted after completion';
    end if;
  end if;

  return new;
end;
$$;

alter table public.orders
  add column if not exists feedback_hidden boolean default false,
  add column if not exists feedback_hidden_at timestamptz,
  add column if not exists feedback_hidden_by text;

drop view if exists public.business_reviews;
create view public.business_reviews as
select
  o.id as order_id,
  o.business_id,
  o.rating,
  o.feedback,
  o.feedback_hidden,
  o.feedback_hidden_at,
  o.feedback_hidden_by,
  o.created_at,
  p.full_name as customer_name
from public.orders o
left join public.profiles p on o.customer_id = p.id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null;

grant select on public.business_reviews to anon, authenticated;

commit;
