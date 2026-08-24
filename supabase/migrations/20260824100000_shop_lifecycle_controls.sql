-- Press & Present shop lifecycle controls.
--
-- This migration protects lifecycle fields, prevents shop deletion, records
-- every lifecycle transition, and exposes admin-only transition functions.
-- Public visibility, activity triggers, and automatic locking are added in
-- later migrations.

begin;

create table if not exists public.shop_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  action text not null check (action in ('AUTO_LOCK', 'MANUAL_LOCK', 'UNLOCK', 'ARCHIVE')),
  previous_state text not null check (previous_state in ('ACTIVE', 'LOCKED', 'ARCHIVED')),
  new_state text not null check (new_state in ('ACTIVE', 'LOCKED', 'ARCHIVED')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists shop_lifecycle_audit_business_created_idx
  on public.shop_lifecycle_audit (business_id, created_at desc);

alter table public.shop_lifecycle_audit enable row level security;

drop policy if exists "Admins can view lifecycle audit" on public.shop_lifecycle_audit;
create policy "Admins can view lifecycle audit"
on public.shop_lifecycle_audit for select
to authenticated
using (public.is_admin());

drop policy if exists "Owners can view own lifecycle audit" on public.shop_lifecycle_audit;
create policy "Owners can view own lifecycle audit"
on public.shop_lifecycle_audit for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = shop_lifecycle_audit.business_id
      and b.owner_id = auth.uid()
  )
);

-- No application role may delete a shop. The trigger below also blocks
-- service-role deletes unless the tightly scoped signup-cleanup function sets
-- its transaction-local marker.
revoke delete on public.businesses from anon, authenticated;

create or replace function public.prevent_business_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.signup_cleanup', true) = 'true'
     and old.status = 'PENDING'
     and old.created_at >= now() - interval '30 minutes' then
    return old;
  end if;

  raise exception 'Shops cannot be deleted. Use ACTIVE, LOCKED, or ARCHIVED state.';
end;
$$;

drop trigger if exists prevent_business_delete on public.businesses;
create trigger prevent_business_delete
before delete on public.businesses
for each row execute function public.prevent_business_delete();

-- Owners and direct admin updates cannot forge lifecycle or activity data.
-- The transition/activity functions set a transaction-local marker before
-- making an authorized database change.
create or replace function public.prevent_business_lifecycle_field_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.business_system_write', true) = 'true' then
    return new;
  end if;

  if old.lifecycle_state is distinct from new.lifecycle_state
     or old.last_activity_at is distinct from new.last_activity_at
     or old.locked_at is distinct from new.locked_at
     or old.locked_by is distinct from new.locked_by
     or old.lock_reason is distinct from new.lock_reason
     or old.archived_at is distinct from new.archived_at
     or old.archived_by is distinct from new.archived_by then
    raise exception 'Lifecycle and activity fields can only be changed by protected server functions.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_business_lifecycle_field_tampering on public.businesses;
create trigger prevent_business_lifecycle_field_tampering
before update on public.businesses
for each row execute function public.prevent_business_lifecycle_field_tampering();

create or replace function public.cleanup_failed_business_signup(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_user_id is null then
    raise exception 'Signup user is required';
  end if;

  perform set_config('app.signup_cleanup', 'true', true);

  delete from public.businesses
  where id = (
    select b.id
    from public.businesses b
    where b.owner_id = p_user_id
      and b.status = 'PENDING'
      and b.created_at >= now() - interval '30 minutes'
    order by b.created_at desc
    limit 1
  );
end;
$$;

revoke all on function public.cleanup_failed_business_signup(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_failed_business_signup(uuid) to service_role;

create or replace function public.admin_set_shop_lifecycle(
  p_business_id uuid,
  p_action text,
  p_reason text,
  p_requester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  next_state text;
  audit_action text;
  reason_text text;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_requester_id
      and role = 'ADMIN'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_action not in ('LOCK', 'UNLOCK', 'ARCHIVE') then
    raise exception 'Invalid shop lifecycle action';
  end if;

  select * into business_row
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'Shop not found';
  end if;

  if p_action = 'LOCK' then
    if business_row.lifecycle_state = 'ARCHIVED' then
      raise exception 'Archived shops cannot be locked';
    end if;
    if business_row.lifecycle_state = 'LOCKED' then
      raise exception 'Shop is already locked';
    end if;
    next_state := 'LOCKED';
    audit_action := 'MANUAL_LOCK';
    reason_text := coalesce(nullif(trim(p_reason), ''), 'Manually locked by an administrator');
  elsif p_action = 'UNLOCK' then
    if business_row.lifecycle_state <> 'LOCKED' then
      raise exception 'Only locked shops can be unlocked';
    end if;
    next_state := 'ACTIVE';
    audit_action := 'UNLOCK';
    reason_text := coalesce(nullif(trim(p_reason), ''), 'Unlocked by an administrator');
  else
    if business_row.lifecycle_state = 'ARCHIVED' then
      raise exception 'Shop is already archived';
    end if;
    next_state := 'ARCHIVED';
    audit_action := 'ARCHIVE';
    reason_text := coalesce(nullif(trim(p_reason), ''), 'Archived by an administrator');
  end if;

  perform set_config('app.business_system_write', 'true', true);

  update public.businesses
  set lifecycle_state = next_state,
      locked_at = case when next_state = 'LOCKED' then now() else locked_at end,
      locked_by = case when next_state = 'LOCKED' then p_requester_id else locked_by end,
      lock_reason = case when next_state = 'LOCKED' then reason_text else lock_reason end,
      archived_at = case when next_state = 'ARCHIVED' then now() else archived_at end,
      archived_by = case when next_state = 'ARCHIVED' then p_requester_id else archived_by end,
      updated_at = now()
  where id = p_business_id;

  insert into public.shop_lifecycle_audit (
    business_id, action, previous_state, new_state, actor_id, reason
  ) values (
    p_business_id, audit_action, business_row.lifecycle_state, next_state,
    p_requester_id, reason_text
  );

  return jsonb_build_object(
    'business_id', p_business_id,
    'previous_state', business_row.lifecycle_state,
    'lifecycle_state', next_state,
    'action', audit_action
  );
end;
$$;

revoke all on function public.admin_set_shop_lifecycle(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_shop_lifecycle(uuid, text, text, uuid)
  to service_role;

commit;
