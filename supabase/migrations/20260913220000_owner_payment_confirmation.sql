-- Secure owner payment confirmation and completion gating.
-- Payment proofs are evidence only until an authenticated business owner
-- explicitly confirms the received amount through owner_confirm_order_payment.

begin;

alter table public.orders
  add column if not exists confirmed_payment_amount numeric(10,2) default 0,
  add column if not exists payment_confirmation_status text default 'UNCONFIRMED',
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by uuid references auth.users(id);

-- New columns receive safe defaults for existing rows. Do not rewrite active
-- historical orders here: older rows may contain legacy fields that newer
-- check constraints reject when any update revalidates the whole row. An
-- explicit owner confirmation is required for those active orders.

update public.orders
set confirmed_payment_amount = greatest(0, coalesce(total, 0)),
    payment_confirmation_status = 'CONFIRMED'
where status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and (
    fully_paid is distinct from true
    or confirmed_payment_amount is distinct from greatest(0, coalesce(total, 0))
    or payment_confirmation_status is distinct from 'CONFIRMED'
  );

alter table public.orders
  alter column confirmed_payment_amount set default 0,
  alter column confirmed_payment_amount set not null,
  alter column payment_confirmation_status set default 'UNCONFIRMED',
  alter column payment_confirmation_status set not null;

alter table public.orders
  drop constraint if exists orders_payment_confirmation_status_check;

alter table public.orders
  add constraint orders_payment_confirmation_status_check
  check (payment_confirmation_status in ('UNCONFIRMED', 'PARTIALLY_CONFIRMED', 'CONFIRMED'));

create table if not exists public.order_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  payment_method text,
  proof_url text,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists order_payment_confirmations_order_idx
  on public.order_payment_confirmations (order_id, confirmed_at desc);

alter table public.order_payment_confirmations enable row level security;

drop policy if exists "Customers can view their payment confirmations" on public.order_payment_confirmations;
create policy "Customers can view their payment confirmations"
on public.order_payment_confirmations for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_payment_confirmations.order_id
      and o.customer_id = auth.uid()
  )
);

drop policy if exists "Owners can view their payment confirmations" on public.order_payment_confirmations;
create policy "Owners can view their payment confirmations"
on public.order_payment_confirmations for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.id = order_payment_confirmations.order_id
      and b.owner_id = auth.uid()
  )
);

-- Notification events make payment reminders and completion messages safe to
-- retry without sending the same event repeatedly.
create table if not exists public.order_notification_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null unique,
  event_type text not null,
  status text not null default 'PROCESSING',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update public.order_notification_events
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create index if not exists order_notification_events_order_idx
  on public.order_notification_events (order_id, created_at desc);

alter table public.order_notification_events enable row level security;

drop policy if exists "Owners can view their order notification events" on public.order_notification_events;
create policy "Owners can view their order notification events"
on public.order_notification_events for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.id = order_notification_events.order_id
      and b.owner_id = auth.uid()
  )
);

-- Keep payment fields server-controlled. The payment RPC sets a transaction
-- local marker so this trigger can distinguish its narrow update from a direct
-- browser attempt to rewrite payment state.
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
  payment_rpc boolean := current_setting('press_present.payment_confirmation_rpc', true) = '1';
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from public.businesses b
    where b.id = old.business_id and b.owner_id = caller
  ) then
    if payment_rpc then
      protected_old := to_jsonb(old) - array[
        'status', 'status_history', 'updated_at',
        'cancel_reason', 'cancelled_at',
        'refund_reason', 'refund_requested_at', 'refunded_at',
        'refund_proof_url', 'refund_receipt_url',
        'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by',
        'confirmed_payment_amount', 'payment_confirmation_status',
        'payment_confirmed_at', 'payment_confirmed_by', 'fully_paid'
      ];
      protected_new := to_jsonb(new) - array[
        'status', 'status_history', 'updated_at',
        'cancel_reason', 'cancelled_at',
        'refund_reason', 'refund_requested_at', 'refunded_at',
        'refund_proof_url', 'refund_receipt_url',
        'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by',
        'confirmed_payment_amount', 'payment_confirmation_status',
        'payment_confirmed_at', 'payment_confirmed_by', 'fully_paid'
      ];
    else
      protected_old := to_jsonb(old) - array[
        'status', 'status_history', 'updated_at',
        'cancel_reason', 'cancelled_at',
        'refund_reason', 'refund_requested_at', 'refunded_at',
        'refund_proof_url', 'refund_receipt_url',
        'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by'
      ];
      protected_new := to_jsonb(new) - array[
        'status', 'status_history', 'updated_at',
        'cancel_reason', 'cancelled_at',
        'refund_reason', 'refund_requested_at', 'refunded_at',
        'refund_proof_url', 'refund_receipt_url',
        'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by'
      ];
    end if;

    if protected_old is distinct from protected_new then
      raise exception 'Owners cannot change protected order fields';
    end if;
  end if;

  return new;
end;
$$;

-- Direct owner status updates must obey the same payment gate as the RPC.
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
    if new.status = 'CANCELLED' and old.status in ('PENDING', 'PLACED', 'PREPARING') then
      return new;
    end if;

    if new.status = 'REFUND_PENDING' and old.status in ('CANCELLED', 'REFUNDED') then
      return new;
    end if;

    if new.status = 'REFUND_CONFIRMED' and old.status = 'REFUNDED' then
      return new;
    end if;
  end if;

  raise exception 'You are not allowed to change this order from % to %.', old.status, new.status;
end;
$$;

drop function if exists public.owner_confirm_order_payment(uuid, numeric);

create function public.owner_confirm_order_payment(
  p_order_id uuid,
  p_amount numeric
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders;
  current_confirmed numeric;
  requested_amount numeric;
  remaining_balance numeric;
  next_confirmed numeric;
  next_payment_status text;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'BUSINESS_OWNER'
  ) then
    raise exception 'Business owner access required';
  end if;

  select o.* into target_order
  from public.orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and b.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found or you do not own this order.';
  end if;

  if target_order.status in ('COMPLETED', 'DELIVERY_COMPLETED') then
    raise exception 'Payment is already confirmed for this completed order.';
  end if;

  if target_order.status in ('CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_CONFIRMED') then
    raise exception 'Payment cannot be confirmed for a cancelled or refunded order.';
  end if;

  requested_amount := round(coalesce(p_amount, 0), 2);
  if requested_amount <= 0 then
    raise exception 'Enter a payment amount greater than zero.';
  end if;

  current_confirmed := greatest(0, least(coalesce(target_order.total, 0), coalesce(target_order.confirmed_payment_amount, 0)));
  remaining_balance := greatest(0, coalesce(target_order.total, 0) - current_confirmed);
  if requested_amount > remaining_balance + 0.009 then
    raise exception 'Payment amount exceeds the remaining balance of %.', remaining_balance;
  end if;

  if upper(coalesce(target_order.payment_method, '')) = 'E-Wallet'
     and nullif(trim(coalesce(target_order.receipt_url, '')), '') is null then
    raise exception 'Payment proof is required before confirming an E-Wallet payment.';
  end if;

  next_confirmed := round(least(coalesce(target_order.total, 0), current_confirmed + requested_amount), 2);
  next_payment_status := case
    when next_confirmed >= greatest(0, coalesce(target_order.total, 0)) then 'CONFIRMED'
    when next_confirmed > 0 then 'PARTIALLY_CONFIRMED'
    else 'UNCONFIRMED'
  end;

  perform set_config('press_present.payment_confirmation_rpc', '1', true);

  update public.orders
  set confirmed_payment_amount = next_confirmed,
      payment_confirmation_status = next_payment_status,
      payment_confirmed_at = now(),
      payment_confirmed_by = auth.uid(),
      fully_paid = next_payment_status = 'CONFIRMED'
  where id = p_order_id;

  insert into public.order_payment_confirmations (
    order_id,
    amount,
    payment_method,
    proof_url,
    confirmed_by
  ) values (
    p_order_id,
    requested_amount,
    target_order.payment_method,
    nullif(trim(coalesce(target_order.receipt_url, '')), ''),
    auth.uid()
  );

  return query select o.* from public.orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.owner_confirm_order_payment(uuid, numeric)
  from public, anon;
grant execute on function public.owner_confirm_order_payment(uuid, numeric)
  to authenticated;

-- Replace the final-status RPC with a payment-aware version while preserving
-- the existing argument order used by the Owner Orders page.
create or replace function public.owner_advance_order_status(
  p_next_status text,
  p_order_id uuid
)
returns setof public.orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_order public.orders;
  expected_status text;
  next_status text := upper(trim(coalesce(p_next_status, '')));
  delivery_mode text;
  remaining_balance numeric;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'BUSINESS_OWNER'
  ) then
    raise exception 'Business owner access required';
  end if;

  select o.* into target_order
  from public.orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and b.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found or you do not own this order.';
  end if;

  delivery_mode := upper(coalesce(nullif(trim(target_order.delivery_type), ''), 'PICKUP'));
  if delivery_mode not in ('PICKUP', 'DELIVERY') then
    raise exception 'This order has an unsupported delivery type.';
  end if;

  expected_status := public.expected_owner_order_next_status(target_order.status, delivery_mode);
  if next_status is distinct from expected_status then
    raise exception 'Invalid order status transition from % to %. The next available status is %.',
      target_order.status, next_status, coalesce(expected_status, 'none');
  end if;

  if next_status in ('COMPLETED', 'DELIVERY_COMPLETED') then
    remaining_balance := greatest(0, coalesce(target_order.total, 0) - coalesce(target_order.confirmed_payment_amount, 0));
    if target_order.fully_paid is not true
       or target_order.payment_confirmation_status is distinct from 'CONFIRMED'
       or remaining_balance > 0.009 then
      raise exception 'Payment confirmation required before completion. Remaining balance is %.', remaining_balance;
    end if;
  end if;

  update public.orders
  set status = next_status
  where id = p_order_id;

  return query select o.* from public.orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.owner_advance_order_status(text, uuid)
  from public, anon;
grant execute on function public.owner_advance_order_status(text, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
