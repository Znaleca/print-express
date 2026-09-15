-- Restore the customer order actions removed from the tracked RLS chain.
-- Customers may cancel eligible orders, request/confirm refunds, and review
-- completed orders, but may not rewrite money, ownership, items, payments,
-- delivery state, moderation state, or the order history.

begin;

drop policy if exists "Customers can update their own orders" on public.orders;
drop policy if exists "Customers can update refund fields on own orders" on public.orders;
drop policy if exists "Customers can update cancellation and refund fields on own orders" on public.orders;
drop policy if exists "Customers can update allowed order fields" on public.orders;

create policy "Customers can update allowed order fields"
on public.orders for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

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
      'rating', 'feedback', 'review_service_id'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'rating', 'feedback', 'review_service_id'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Customers cannot change protected order fields';
    end if;

    if new.status is distinct from old.status then
      if new.status = 'CANCELLED' and old.status in ('PENDING', 'PLACED', 'PREPARING') then
        null;
      elsif new.status = 'REFUND_PENDING' and old.status in ('CANCELLED', 'REFUNDED') then
        null;
      elsif new.status = 'REFUND_CONFIRMED' and old.status = 'REFUNDED' then
        null;
      else
        raise exception 'Customers cannot set this order status';
      end if;
    end if;

    if new.cancel_reason is distinct from old.cancel_reason
       or new.cancelled_at is distinct from old.cancelled_at then
      if new.status <> 'CANCELLED' or old.status not in ('PENDING', 'PLACED', 'PREPARING') then
        raise exception 'Cancellation details are only valid while cancelling an eligible order';
      end if;
    end if;

    if new.refund_reason is distinct from old.refund_reason
       or new.refund_requested_at is distinct from old.refund_requested_at then
      if new.status <> 'REFUND_PENDING' or old.status not in ('CANCELLED', 'REFUNDED') then
        raise exception 'Refund details are only valid while requesting a refund';
      end if;
    end if;

    if old.status not in ('COMPLETED', 'DELIVERY_COMPLETED')
       and (new.rating is distinct from old.rating
         or new.feedback is distinct from old.feedback
         or new.review_service_id is distinct from old.review_service_id) then
      raise exception 'Reviews can only be submitted after completion';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_customer_order_tampering() from public, anon, authenticated;

drop trigger if exists prevent_customer_order_tampering on public.orders;
create trigger prevent_customer_order_tampering
before update on public.orders
for each row execute function public.prevent_customer_order_tampering();

notify pgrst, 'reload schema';

commit;
