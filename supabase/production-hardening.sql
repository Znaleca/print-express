-- Production hardening for Press & Present.
-- Run this AFTER the existing table migrations. This script is intentionally
-- additive and uses only CUSTOMER, BUSINESS_OWNER, and ADMIN role values.

-- -------------------------------------------------------------------------
-- Shared admin helper
-- -------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Pricing and inventory: public can read only active rules for approved shops;
-- only the shop owner can change their own rows.
-- -------------------------------------------------------------------------
drop policy if exists "Public can view pricing rules" on public.service_pricing_rules;
drop policy if exists "Owners can edit pricing rules" on public.service_pricing_rules;
drop policy if exists "Owners manage own pricing rules" on public.service_pricing_rules;

create policy "Public can view active pricing rules"
on public.service_pricing_rules for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1 from public.businesses b
    where b.id = service_pricing_rules.business_id
      and b.status = 'APPROVED'
  )
);

create policy "Owners manage own pricing rules"
on public.service_pricing_rules for all
to authenticated
using (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
)
with check (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
);

drop policy if exists "Owners can manage inventory movements" on public.inventory_movements;
drop policy if exists "Owners manage own inventory movements" on public.inventory_movements;

create policy "Owners manage own inventory movements"
on public.inventory_movements for all
to authenticated
using (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
)
with check (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
);

-- -------------------------------------------------------------------------
-- Design proofs and order documents: only the customer, assigned owner, or
-- admin can see files related to an order/conversation.
-- -------------------------------------------------------------------------
drop policy if exists "Public can view design proofs" on public.design_proofs;
drop policy if exists "Users can insert proofs" on public.design_proofs;
drop policy if exists "Users can update proofs" on public.design_proofs;
drop policy if exists "Participants can view design proofs" on public.design_proofs;
drop policy if exists "Participants can upload design proofs" on public.design_proofs;
drop policy if exists "Owners can update design proofs" on public.design_proofs;

create policy "Participants can view design proofs"
on public.design_proofs for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = design_proofs.order_id
      and (o.customer_id = auth.uid() or exists (
        select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid()
      ))
  )
  or exists (
    select 1 from public.chat_conversations c
    where c.id = design_proofs.conversation_id
      and (c.customer_id = auth.uid() or exists (
        select 1 from public.businesses b where b.id = c.business_id and b.owner_id = auth.uid()
      ))
  )
);

create policy "Participants can upload design proofs"
on public.design_proofs for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = design_proofs.order_id
        and (o.customer_id = auth.uid() or exists (
          select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid()
        ))
    )
    or exists (
      select 1 from public.chat_conversations c
      where c.id = design_proofs.conversation_id
        and (c.customer_id = auth.uid() or exists (
          select 1 from public.businesses b where b.id = c.business_id and b.owner_id = auth.uid()
        ))
    )
  )
);

create policy "Owners can update design proofs"
on public.design_proofs for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = design_proofs.order_id
      and exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  )
  or exists (
    select 1 from public.chat_conversations c
    where c.id = design_proofs.conversation_id
      and exists (select 1 from public.businesses b where b.id = c.business_id and b.owner_id = auth.uid())
  )
)
;

drop policy if exists "Participants can view order documents" on public.order_documents;
drop policy if exists "Owners can manage order documents" on public.order_documents;
drop policy if exists "Admins can manage order documents" on public.order_documents;

create policy "Participants can view order documents"
on public.order_documents for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_documents.order_id
      and (o.customer_id = auth.uid() or exists (
        select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid()
      ))
  )
);

create policy "Owners can manage order documents"
on public.order_documents for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_documents.order_id
      and exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_documents.order_id
      and exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  )
);

drop policy if exists "Public can view SMS notification logs" on public.sms_notification_logs;
drop policy if exists "Authenticated users can read SMS notification logs" on public.sms_notification_logs;
drop policy if exists "Owners can view SMS notification logs" on public.sms_notification_logs;

-- Older installations may already have this table without the order link.
-- Add it before the owner/admin policy references sms_notification_logs.order_id.
alter table if exists public.sms_notification_logs
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create policy "Owners can view SMS notification logs"
on public.sms_notification_logs for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = sms_notification_logs.order_id
      and exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  )
);

-- -------------------------------------------------------------------------
-- Orders: remove broad customer UPDATE policies. Customers may update only
-- cancellation/refund/review fields; the trigger below blocks price, owner,
-- item, payment, and delivery tampering even if another old policy remains.
-- -------------------------------------------------------------------------
drop policy if exists "Customers can update their own orders" on public.orders;
drop policy if exists "Customers can update refund fields on own orders" on public.orders;
drop policy if exists "Customers can update cancellation and refund fields on own orders" on public.orders;
drop policy if exists "Customers can update allowed order fields" on public.orders;

create policy "Customers can update allowed order fields"
on public.orders for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

-- Keep owner writes scoped to their own shop and require the business_id to
-- remain unchanged after an update.
drop policy if exists "Owners can update their bound orders" on public.orders;
create policy "Owners can update their bound orders"
on public.orders for update
to authenticated
using (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
)
with check (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
);

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

    if old.status <> 'COMPLETED' and (new.rating is distinct from old.rating or new.feedback is distinct from old.feedback) then
      raise exception 'Reviews can only be submitted after completion';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_customer_order_tampering() from public;

drop trigger if exists prevent_customer_order_tampering on public.orders;
create trigger prevent_customer_order_tampering
before update on public.orders
for each row execute function public.prevent_customer_order_tampering();
