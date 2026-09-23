-- Customer order policy:
--   * Pending orders may be cancelled or submitted for refund review.
--   * Placed orders cannot be cancelled, but may be submitted for refund review.
-- Keep these rules in both customer tamper protection and the status transition
-- trigger so direct client updates and normal UI actions follow the same policy.

begin;

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
      if new.status = 'CANCELLED' and old.status = 'PENDING' then
        null;
      elsif new.status = 'REFUND_PENDING' and old.status in ('PENDING', 'PLACED') then
        null;
      elsif new.status = 'REFUND_PENDING' and old.status = 'REFUNDED' then
        -- Preserve the existing ability to report an owner-issued refund that
        -- the customer did not receive.
        null;
      elsif new.status = 'REFUND_CONFIRMED' and old.status = 'REFUNDED' then
        null;
      else
        raise exception 'Customers cannot set this order status';
      end if;
    end if;

    if new.cancel_reason is distinct from old.cancel_reason
       or new.cancelled_at is distinct from old.cancelled_at then
      if new.status <> 'CANCELLED' or old.status <> 'PENDING' then
        raise exception 'Cancellation details are only valid while cancelling a pending order';
      end if;
    end if;

    if new.refund_reason is distinct from old.refund_reason
       or new.refund_requested_at is distinct from old.refund_requested_at then
      if new.status <> 'REFUND_PENDING' or old.status not in ('PENDING', 'PLACED', 'REFUNDED') then
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

create or replace function public.guard_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  expected_status text;
  is_owner boolean;
  is_customer boolean;
  remaining_balance numeric;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  is_owner := exists (
    select 1 from public.businesses
    where id = new.business_id and owner_id = caller
  );
  is_customer := new.customer_id = caller;

  if is_owner then
    expected_status := public.expected_owner_order_next_status(old.status, new.delivery_type);

    if new.status = expected_status
       and new.status in ('COMPLETED', 'DELIVERY_COMPLETED') then
      remaining_balance := greatest(0, coalesce(new.total, 0) - coalesce(new.confirmed_payment_amount, 0));
      if new.fully_paid is not true
         or new.payment_confirmation_status is distinct from 'CONFIRMED'
         or remaining_balance > 0.009 then
        raise exception 'Payment confirmation required before completion. Remaining balance is %.', remaining_balance;
      end if;
    end if;

    if new.status = expected_status then
      return new;
    end if;

    if new.status = 'CANCELLED' and old.status in ('PENDING', 'PLACED', 'PREPARING') then
      return new;
    end if;

    if new.status = 'REFUNDED'
       and old.status in ('CANCELLED', 'REFUND_PENDING')
       and new.refund_proof_url is not null then
      return new;
    end if;

    raise exception 'Invalid order status transition from % to %. The next available status is %.',
      old.status, new.status, coalesce(expected_status, 'none');
  end if;

  if is_customer then
    if new.status = 'CANCELLED' and old.status = 'PENDING' then
      return new;
    end if;

    if new.status = 'REFUND_PENDING' and old.status in ('PENDING', 'PLACED', 'REFUNDED') then
      return new;
    end if;

    if new.status = 'REFUND_CONFIRMED' and old.status = 'REFUNDED' then
      return new;
    end if;
  end if;

  raise exception 'You are not allowed to change this order from % to %.', old.status, new.status;
end;
$$;

notify pgrst, 'reload schema';

commit;
