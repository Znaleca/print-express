-- Avoid a PL/pgSQL variable/column name collision when an owner confirms the
-- remaining payment. PostgreSQL otherwise rejects the approval update.

begin;

create or replace function public.owner_review_remaining_payment(
  p_order_id uuid,
  p_decision text,
  p_reason text default null,
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
  decision text := upper(trim(coalesce(p_decision, '')));
  is_admin_caller boolean := false;
  current_confirmed numeric;
  remaining_balance numeric;
  reviewed_method text;
  proof_reference text;
  confirmation_source text;
  confirmation_note text := left(nullif(trim(p_reason), ''), 500);
begin
  if caller is null and coalesce(auth.role(), '') = 'service_role' then
    caller := p_requester_id;
  end if;
  if caller is null then
    raise exception 'Business owner authentication required';
  end if;

  select p.role = 'ADMIN' into is_admin_caller
  from public.profiles p
  where p.id = caller;
  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.role in ('BUSINESS_OWNER', 'ADMIN')
  ) then
    raise exception 'Business owner or Admin access required';
  end if;

  if decision not in ('APPROVE', 'REJECT', 'REVIEW', 'UNDER_REVIEW', 'MANUAL') then
    raise exception 'Unsupported payment review decision';
  end if;

  select o.* into target_order
  from public.orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and (b.owner_id = caller or is_admin_caller)
  for update;
  if not found then
    raise exception 'Order not found or you do not manage this order';
  end if;

  if target_order.status in ('COMPLETED', 'DELIVERY_COMPLETED') then
    raise exception 'Payment is already confirmed for this completed order';
  end if;
  if target_order.status in ('CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_CONFIRMED') then
    raise exception 'Payment cannot be reviewed for a cancelled or refunded order';
  end if;

  if decision in ('REVIEW', 'UNDER_REVIEW') then
    if target_order.remaining_payment_status <> 'SUBMITTED' then
      raise exception 'Only a submitted remaining payment can be marked under review';
    end if;
    perform set_config('press_present.remaining_payment_rpc', '1', true);
    update public.orders
    set remaining_payment_status = 'UNDER_REVIEW'
    where id = p_order_id;
    return query select o.* from public.orders o where o.id = p_order_id;
    return;
  end if;

  current_confirmed := greatest(0, least(coalesce(target_order.total, 0), coalesce(target_order.confirmed_payment_amount, 0)));
  remaining_balance := greatest(0, coalesce(target_order.total, 0) - current_confirmed);
  if target_order.total is null or remaining_balance <= 0.009 then
    raise exception 'This order has no remaining balance';
  end if;

  if decision = 'REJECT' then
    if target_order.remaining_payment_status not in ('SUBMITTED', 'UNDER_REVIEW') then
      raise exception 'Only a submitted payment can be rejected';
    end if;
    perform set_config('press_present.remaining_payment_rpc', '1', true);
    update public.orders
    set remaining_payment_status = 'REJECTED',
        remaining_payment_rejection_reason = coalesce(confirmation_note, 'Payment proof or payment declaration was rejected by the shop.'),
        remaining_payment_reviewed_at = now(),
        remaining_payment_reviewed_by = caller
    where id = p_order_id;
    return query select o.* from public.orders o where o.id = p_order_id;
    return;
  end if;

  if decision = 'APPROVE' and target_order.remaining_payment_status not in ('SUBMITTED', 'UNDER_REVIEW') then
    raise exception 'Only a submitted remaining payment can be approved';
  end if;

  reviewed_method := case
    when decision = 'MANUAL' then coalesce(target_order.remaining_payment_method, 'MANUAL')
    else target_order.remaining_payment_method
  end;
  proof_reference := nullif(trim(coalesce(target_order.remaining_payment_proof_url, '')), '');

  if decision = 'APPROVE' and reviewed_method = 'E-Wallet' and proof_reference is null then
    raise exception 'Payment proof is required before approving an E-Wallet payment';
  end if;
  if reviewed_method = 'COD' and proof_reference is not null then
    raise exception 'COD/offline payment cannot have a proof reference';
  end if;

  confirmation_source := case
    when decision = 'MANUAL' then 'OWNER_MANUAL'
    when reviewed_method = 'COD' then 'CUSTOMER_COD_DECLARATION'
    else 'CUSTOMER_PAYMENT_PROOF'
  end;

  perform set_config('press_present.remaining_payment_rpc', '1', true);

  update public.orders
  set confirmed_payment_amount = round(coalesce(target_order.total, 0), 2),
      balance_amount = 0,
      payment_confirmation_status = 'CONFIRMED',
      payment_confirmed_at = now(),
      payment_confirmed_by = caller,
      fully_paid = true,
      remaining_payment_status = 'APPROVED',
      remaining_payment_method = reviewed_method,
      remaining_payment_rejection_reason = null,
      remaining_payment_reviewed_at = now(),
      remaining_payment_reviewed_by = caller
  where id = p_order_id;

  insert into public.order_payment_confirmations (
    order_id,
    amount,
    payment_method,
    proof_url,
    confirmed_by,
    confirmation_note,
    payment_source
  ) values (
    p_order_id,
    round(remaining_balance, 2),
    reviewed_method,
    proof_reference,
    caller,
    confirmation_note,
    confirmation_source
  );

  return query select o.* from public.orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.owner_review_remaining_payment(uuid, text, text, uuid) from public, anon;
grant execute on function public.owner_review_remaining_payment(uuid, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
