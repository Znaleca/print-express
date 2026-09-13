-- Enforce the owner verification lock at the database boundary.
-- A browser route guard is helpful UX, but it cannot be the source of truth:
-- owners can still issue direct Supabase requests from an old tab or a script.

begin;

create or replace function public.is_business_verification_complete(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct d.doc_type) = 4
  from public.business_documents d
  where d.business_id = p_business_id
    and d.doc_type in ('DTI', 'MAYORS_PERMIT', 'BIR', 'VALID_ID')
    and d.status = 'APPROVED';
$$;

revoke all on function public.is_business_verification_complete(uuid) from public, anon;
grant execute on function public.is_business_verification_complete(uuid) to authenticated, service_role;

-- Keep customer visibility safe even for rows that existed before this
-- migration or were restored from a stale backup.
create or replace function public.is_business_customer_visible(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.status = 'APPROVED'
      and b.lifecycle_state = 'ACTIVE'
      and public.is_business_verification_complete(b.id)
      and not public.is_business_inactivity_expired(b.id)
  );
$$;

-- The batched customer badge lookup must use the same predicate as the RLS
-- policy and storefront query.
create or replace function public.get_business_open_states(p_business_ids uuid[])
returns table (business_id uuid, is_open boolean)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, public.is_business_open_now(b.id)
  from public.businesses b
  where b.id = any(coalesce(p_business_ids, array[]::uuid[]))
    and public.is_business_customer_visible(b.id);
$$;

-- Owners may edit storefront fields, but never forge the verification status or
-- ownership. Opening a shop is also limited to an explicitly approved and
-- active business. Admin/service-role workflows remain able to make protected
-- changes through their existing server functions.
create or replace function public.prevent_owner_verification_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if old.owner_id = auth.uid() then
    if old.owner_id is distinct from new.owner_id
       or old.status is distinct from new.status then
      raise exception 'Shop verification and ownership can only be changed by an administrator.';
    end if;

    if ((old.is_open is distinct from new.is_open and coalesce(new.is_open, false))
        or (old.manual_open_override is distinct from new.manual_open_override
            and coalesce(new.manual_open_override, false)))
       and (new.status <> 'APPROVED'
            or new.lifecycle_state <> 'ACTIVE'
            or not public.is_business_verification_complete(new.id)) then
      raise exception 'Shop must be approved and active before it can be opened.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_owner_verification_tampering on public.businesses;
create trigger prevent_owner_verification_tampering
before update on public.businesses
for each row
execute function public.prevent_owner_verification_tampering();

revoke all on function public.prevent_owner_verification_tampering() from public;

-- If a required document is rejected, removed, or otherwise ceases to be
-- approved, demote the shop back to PENDING and close it immediately. This
-- never promotes a shop; final approval remains an explicit Admin action.
create or replace function public.sync_business_verification_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid;
begin
  if tg_op = 'DELETE' then
    target_business_id := old.business_id;
  else
    target_business_id := new.business_id;
  end if;

  if exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
      and b.status = 'APPROVED'
      and not public.is_business_verification_complete(target_business_id)
  ) then
    update public.businesses
    set status = 'PENDING',
        is_open = false,
        manual_open_override = null,
        manual_override_until = null
    where id = target_business_id
      and status = 'APPROVED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_business_verification_lock on public.business_documents;
create trigger sync_business_verification_lock
after insert or update or delete on public.business_documents
for each row
execute function public.sync_business_verification_lock();

revoke all on function public.sync_business_verification_lock() from public;

-- An owner can cancel/refund according to the existing workflow while locked,
-- but cannot accept or process an order for an unapproved/inactive shop.
create or replace function public.guard_owner_order_processing_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin()
     and new.status in ('PLACED', 'PREPARING', 'READY_TO_PICK_UP', 'RIDER_ON_THE_WAY', 'DELIVERY_COMPLETED', 'COMPLETED')
     and exists (
       select 1
       from public.businesses b
       where b.id = new.business_id
         and b.owner_id = auth.uid()
         and (b.status <> 'APPROVED'
              or b.lifecycle_state <> 'ACTIVE'
              or not public.is_business_verification_complete(b.id))
     ) then
    raise exception 'Shop verification is not active. The shop cannot process orders until it is approved and active.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_owner_verification_lock on public.orders;
create trigger orders_owner_verification_lock
before update of status on public.orders
for each row
execute function public.guard_owner_order_processing_lock();

revoke all on function public.guard_owner_order_processing_lock() from public;

-- Defense in depth for customer checkout. The existing atomic checkout RPC
-- performs its own check; this trigger also covers any future insert path.
create or replace function public.guard_order_business_verification_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = new.business_id
      and b.status = 'APPROVED'
      and b.lifecycle_state = 'ACTIVE'
      and public.is_business_verification_complete(b.id)
  ) then
    raise exception 'This shop is not available for new orders.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_business_verification_lock on public.orders;
create trigger orders_business_verification_lock
before insert on public.orders
for each row
execute function public.guard_order_business_verification_lock();

revoke all on function public.guard_order_business_verification_lock() from public;

commit;
