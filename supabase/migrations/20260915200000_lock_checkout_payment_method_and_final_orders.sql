-- Keep the customer's remaining-payment submission tied to the method chosen
-- at checkout, and make placed orders final from the customer side.

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
      'rating', 'feedback', 'review_service_id'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'rating', 'feedback', 'review_service_id'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Customers cannot change protected order fields';
    end if;

    if new.status is distinct from old.status then
      if new.status = 'REFUND_PENDING' and old.status = 'REFUNDED' then
        -- Preserve the existing ability to report an owner-issued refund that
        -- the customer did not receive.
        null;
      elsif new.status = 'REFUND_CONFIRMED' and old.status = 'REFUNDED' then
        null;
      elsif new.status = 'CANCELLED' or new.status = 'REFUND_PENDING' then
        raise exception 'Orders are final after placement. Customers cannot cancel or request a refund';
      else
        raise exception 'Customers cannot set this order status';
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

drop function if exists public.customer_submit_remaining_payment(uuid, text, text, text, text, integer, text, uuid);
create function public.customer_submit_remaining_payment(
  p_order_id uuid,
  p_method text,
  p_proof_url text default null,
  p_proof_file_name text default null,
  p_proof_content_type text default null,
  p_proof_size_bytes integer default null,
  p_note text default null,
  p_requester_id uuid default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_order public.orders;
  normalized_method text;
  checkout_method text;
  current_confirmed numeric;
  remaining_balance numeric;
  proof_reference text := nullif(trim(coalesce(p_proof_url, '')), '');
  proof_type text := lower(nullif(trim(coalesce(p_proof_content_type, '')), ''));
begin
  if caller is null and coalesce(auth.role(), '') = 'service_role' then
    caller := p_requester_id;
  end if;
  if caller is null then
    raise exception 'Customer authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.role = 'CUSTOMER'
  ) then
    raise exception 'Customer access required';
  end if;

  normalized_method := case
    when upper(replace(replace(trim(coalesce(p_method, '')), '-', ''), ' ', '')) in ('COD', 'CASH', 'OFFLINE', 'CODOFFLINE') then 'COD'
    when upper(replace(replace(trim(coalesce(p_method, '')), '-', ''), ' ', '')) = 'EWALLET' then 'E-Wallet'
    else null
  end;
  if normalized_method is null then
    raise exception 'Choose E-Wallet or COD/offline payment';
  end if;

  select o.* into target_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = caller
  for update;
  if not found then
    raise exception 'Order not found or you do not own this order';
  end if;

  checkout_method := case
    when upper(replace(replace(trim(coalesce(target_order.payment_method, '')), '-', ''), ' ', '')) in ('COD', 'CASH', 'OFFLINE', 'CODOFFLINE') then 'COD'
    when upper(replace(replace(trim(coalesce(target_order.payment_method, '')), '-', ''), ' ', '')) = 'EWALLET' then 'E-Wallet'
    else null
  end;
  if checkout_method is null or normalized_method <> checkout_method then
    raise exception 'Use the remaining payment method selected at checkout';
  end if;

  if target_order.status in ('COMPLETED', 'DELIVERY_COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_CONFIRMED') then
    raise exception 'This order is no longer accepting a remaining payment';
  end if;

  current_confirmed := greatest(0, least(coalesce(target_order.total, 0), coalesce(target_order.confirmed_payment_amount, 0)));
  remaining_balance := greatest(0, coalesce(target_order.total, 0) - current_confirmed);
  if target_order.total is null or remaining_balance <= 0.009 then
    raise exception 'This order has no remaining balance';
  end if;

  if target_order.remaining_payment_status in ('SUBMITTED', 'UNDER_REVIEW') then
    raise exception 'A remaining payment submission is already under review';
  end if;
  if target_order.remaining_payment_status = 'APPROVED' or target_order.payment_confirmation_status = 'CONFIRMED' then
    raise exception 'This remaining payment was already confirmed';
  end if;

  if normalized_method = 'E-Wallet' then
    if proof_reference is null then
      raise exception 'Upload an image or PDF payment proof for E-Wallet payment';
    end if;
    if proof_reference !~ ('^private-assets:payments/' || caller::text || '/' || p_order_id::text || '/[^/]+$') then
      raise exception 'Payment proof storage reference is invalid';
    end if;
    if proof_type not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
      raise exception 'Payment proof must be PNG, JPG, WebP, or PDF';
    end if;
    if coalesce(p_proof_size_bytes, 0) <= 0 or p_proof_size_bytes > 5242880 then
      raise exception 'Payment proof must be between 1 byte and 5 MB';
    end if;
  elsif proof_reference is not null then
    raise exception 'COD/offline declarations do not accept a payment proof file';
  end if;

  perform set_config('press_present.remaining_payment_rpc', '1', true);

  update public.orders
  set remaining_payment_status = 'SUBMITTED',
      remaining_payment_method = normalized_method,
      remaining_payment_proof_url = proof_reference,
      remaining_payment_proof_name = case when normalized_method = 'E-Wallet' then left(nullif(trim(p_proof_file_name), ''), 255) else null end,
      remaining_payment_proof_content_type = case when normalized_method = 'E-Wallet' then proof_type else null end,
      remaining_payment_proof_size_bytes = case when normalized_method = 'E-Wallet' then p_proof_size_bytes else null end,
      remaining_payment_note = left(nullif(trim(p_note), ''), 500),
      remaining_payment_rejection_reason = null,
      remaining_payment_submitted_at = now(),
      remaining_payment_reviewed_at = null,
      remaining_payment_reviewed_by = null
  where id = p_order_id;

  return query select o.* from public.orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.customer_submit_remaining_payment(uuid, text, text, text, text, integer, text, uuid) from public, anon;
grant execute on function public.customer_submit_remaining_payment(uuid, text, text, text, text, integer, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
