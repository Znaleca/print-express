-- Remaining-balance payment workflow.
-- Payment amounts are calculated from the locked order total and the current
-- confirmed snapshot. Client requests only describe the payment method and,
-- for an e-wallet payment, point to an already validated private asset.

begin;

alter table public.orders
  add column if not exists remaining_payment_status text not null default 'NOT_SUBMITTED',
  add column if not exists remaining_payment_method text,
  add column if not exists remaining_payment_proof_url text,
  add column if not exists remaining_payment_proof_name text,
  add column if not exists remaining_payment_proof_content_type text,
  add column if not exists remaining_payment_proof_size_bytes integer,
  add column if not exists remaining_payment_note text,
  add column if not exists remaining_payment_rejection_reason text,
  add column if not exists remaining_payment_submitted_at timestamptz,
  add column if not exists remaining_payment_reviewed_at timestamptz,
  add column if not exists remaining_payment_reviewed_by uuid references auth.users(id);

alter table public.orders
  drop constraint if exists orders_remaining_payment_status_check;
alter table public.orders
  add constraint orders_remaining_payment_status_check
  check (remaining_payment_status in ('NOT_REQUIRED', 'NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'));

alter table public.orders
  drop constraint if exists orders_remaining_payment_method_check;
alter table public.orders
  add constraint orders_remaining_payment_method_check
  check (remaining_payment_method is null or remaining_payment_method in ('E-Wallet', 'COD', 'MANUAL'));

alter table public.orders
  drop constraint if exists orders_remaining_payment_proof_size_check;
alter table public.orders
  add constraint orders_remaining_payment_proof_size_check
  check (remaining_payment_proof_size_bytes is null or (remaining_payment_proof_size_bytes > 0 and remaining_payment_proof_size_bytes <= 5242880));

alter table public.order_payment_confirmations
  add column if not exists confirmation_note text,
  add column if not exists payment_source text not null default 'OWNER_CONFIRMED';

create index if not exists orders_remaining_payment_status_idx
  on public.orders (business_id, remaining_payment_status, updated_at desc);

-- Keep all payment workflow fields server-controlled. This complements the
-- owner-specific trigger from earlier migrations and also blocks a customer
-- from rewriting payment state through a broad orders update policy.
create or replace function public.prevent_order_payment_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workflow_rpc boolean := current_setting('press_present.payment_confirmation_rpc', true) = '1'
    or current_setting('press_present.remaining_payment_rpc', true) = '1';
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() or workflow_rpc then
    return new;
  end if;

  if old.total is distinct from new.total
     or old.downpayment_amount is distinct from new.downpayment_amount
     or old.balance_amount is distinct from new.balance_amount
     or old.confirmed_payment_amount is distinct from new.confirmed_payment_amount
     or old.payment_confirmation_status is distinct from new.payment_confirmation_status
     or old.payment_confirmed_at is distinct from new.payment_confirmed_at
     or old.payment_confirmed_by is distinct from new.payment_confirmed_by
     or old.fully_paid is distinct from new.fully_paid
     or old.receipt_url is distinct from new.receipt_url
     or old.remaining_payment_status is distinct from new.remaining_payment_status
     or old.remaining_payment_method is distinct from new.remaining_payment_method
     or old.remaining_payment_proof_url is distinct from new.remaining_payment_proof_url
     or old.remaining_payment_proof_name is distinct from new.remaining_payment_proof_name
     or old.remaining_payment_proof_content_type is distinct from new.remaining_payment_proof_content_type
     or old.remaining_payment_proof_size_bytes is distinct from new.remaining_payment_proof_size_bytes
     or old.remaining_payment_note is distinct from new.remaining_payment_note
     or old.remaining_payment_rejection_reason is distinct from new.remaining_payment_rejection_reason
     or old.remaining_payment_submitted_at is distinct from new.remaining_payment_submitted_at
     or old.remaining_payment_reviewed_at is distinct from new.remaining_payment_reviewed_at
     or old.remaining_payment_reviewed_by is distinct from new.remaining_payment_reviewed_by then
    raise exception 'Payment state can only be changed through the secure payment workflow';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_order_payment_tampering() from public, anon, authenticated;
drop trigger if exists prevent_order_payment_tampering on public.orders;
create trigger prevent_order_payment_tampering
before update on public.orders
for each row execute function public.prevent_order_payment_tampering();

-- The earlier owner guard must also understand the narrow payment workflow
-- marker. Without this replacement it would mistake a secure RPC update for
-- a direct owner edit and reject the confirmation.
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
  workflow_rpc boolean := current_setting('press_present.payment_confirmation_rpc', true) = '1'
    or current_setting('press_present.remaining_payment_rpc', true) = '1';
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
      'refund_proof_url', 'refund_receipt_url',
      'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by',
      'rating', 'feedback', 'fully_paid'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by',
      'rating', 'feedback', 'fully_paid'
    ];

    if workflow_rpc then
      protected_old := protected_old - array[
        'balance_amount', 'confirmed_payment_amount', 'payment_confirmation_status',
        'payment_confirmed_at', 'payment_confirmed_by', 'receipt_url',
        'remaining_payment_status', 'remaining_payment_method',
        'remaining_payment_proof_url', 'remaining_payment_proof_name',
        'remaining_payment_proof_content_type', 'remaining_payment_proof_size_bytes',
        'remaining_payment_note', 'remaining_payment_rejection_reason',
        'remaining_payment_submitted_at', 'remaining_payment_reviewed_at',
        'remaining_payment_reviewed_by'
      ];
      protected_new := protected_new - array[
        'balance_amount', 'confirmed_payment_amount', 'payment_confirmation_status',
        'payment_confirmed_at', 'payment_confirmed_by', 'receipt_url',
        'remaining_payment_status', 'remaining_payment_method',
        'remaining_payment_proof_url', 'remaining_payment_proof_name',
        'remaining_payment_proof_content_type', 'remaining_payment_proof_size_bytes',
        'remaining_payment_note', 'remaining_payment_rejection_reason',
        'remaining_payment_submitted_at', 'remaining_payment_reviewed_at',
        'remaining_payment_reviewed_by'
      ];
    end if;

    if protected_old is distinct from protected_new then
      raise exception 'Owners cannot change protected order fields';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_owner_order_tampering() from public, anon, authenticated;

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
  current_confirmed numeric;
  remaining_balance numeric;
  proof_reference text := nullif(trim(coalesce(p_proof_url, '')), '');
  proof_type text := lower(nullif(trim(coalesce(p_proof_content_type, '')), ''));
begin
  -- The API route uses the service role only after authenticating the bearer
  -- token. A normal authenticated browser call can never choose another user.
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

drop function if exists public.owner_review_remaining_payment(uuid, text, text, uuid);
create function public.owner_review_remaining_payment(
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
  payment_method text;
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

  payment_method := case
    when decision = 'MANUAL' then coalesce(target_order.remaining_payment_method, 'MANUAL')
    else target_order.remaining_payment_method
  end;
  proof_reference := nullif(trim(coalesce(target_order.remaining_payment_proof_url, '')), '');

  if decision = 'APPROVE' and payment_method = 'E-Wallet' and proof_reference is null then
    raise exception 'Payment proof is required before approving an E-Wallet payment';
  end if;
  if payment_method = 'COD' and proof_reference is not null then
    raise exception 'COD/offline payment cannot have a proof reference';
  end if;

  confirmation_source := case
    when decision = 'MANUAL' then 'OWNER_MANUAL'
    when payment_method = 'COD' then 'CUSTOMER_COD_DECLARATION'
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
      remaining_payment_method = payment_method,
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
    payment_method,
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
