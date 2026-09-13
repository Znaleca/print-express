-- Owner inactivity and sequential order workflow hardening.
-- This is the latest definition of the lifecycle functions and owner RPC.

begin;

-- The inactivity window is configuration, not presentation. Keep a singleton
-- row available and move the existing setting to the new 30-day policy.
insert into public.shop_lifecycle_settings (singleton, inactivity_days)
values (true, 30)
on conflict (singleton) do update
set inactivity_days = 30,
    updated_at = now();

create or replace function public.owner_inactivity_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.inactivity_days
     from public.shop_lifecycle_settings s
     where s.singleton = true),
    30
  );
$$;

revoke all on function public.owner_inactivity_days() from public, anon, authenticated;

-- An inactivity check only applies to businesses owned by a trusted
-- BUSINESS_OWNER profile. An ADMIN profile can never enter an automatic-lock
-- path, even if old data associates a shop with that user.
create or replace function public.is_business_inactivity_expired(p_business_id uuid)
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
      and exists (
        select 1
        from public.profiles p
        where p.id = b.owner_id
          and p.role = 'BUSINESS_OWNER'
      )
      and b.last_activity_at <= now() - make_interval(days => public.owner_inactivity_days())
  );
$$;

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
      and not public.is_business_inactivity_expired(b.id)
  );
$$;

-- Scheduler path: service role only, owner profile explicitly required.
create or replace function public.auto_lock_inactive_shops()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  cutoff_at timestamptz := now() - make_interval(days => public.owner_inactivity_days());
  reason_text text := format(
    'Automatically locked after %s days without meaningful owner activity.',
    public.owner_inactivity_days()
  );
  locked_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  for business_row in
    select b.*
    from public.businesses b
    where b.status = 'APPROVED'
      and b.lifecycle_state = 'ACTIVE'
      and b.last_activity_at <= cutoff_at
      and exists (
        select 1
        from public.profiles p
        where p.id = b.owner_id
          and p.role = 'BUSINESS_OWNER'
      )
    order by b.last_activity_at asc, b.id asc
    for update skip locked
  loop
    perform set_config('app.business_system_write', 'true', true);

    update public.businesses
    set lifecycle_state = 'LOCKED',
        locked_at = now(),
        locked_by = null,
        lock_reason = reason_text,
        updated_at = now()
    where id = business_row.id
      and status = 'APPROVED'
      and lifecycle_state = 'ACTIVE'
      and last_activity_at <= cutoff_at;

    if found then
      insert into public.shop_lifecycle_audit (
        business_id, action, previous_state, new_state, actor_id, reason
      ) values (
        business_row.id, 'AUTO_LOCK', 'ACTIVE', 'LOCKED', null, reason_text
      );
      locked_count := locked_count + 1;
    end if;
  end loop;

  return locked_count;
end;
$$;

revoke all on function public.auto_lock_inactive_shops() from public, anon, authenticated;
grant execute on function public.auto_lock_inactive_shops() to service_role;

-- Lazy owner activity path: only a trusted BUSINESS_OWNER can cause a lock or
-- refresh activity. Frontend values are never used to select the role.
create or replace function public.touch_business_activity(
  p_business_id uuid,
  p_activity_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  business_row public.businesses%rowtype;
  reason_text text := format(
    'Automatically locked after %s days without meaningful owner activity.',
    public.owner_inactivity_days()
  );
begin
  if actor_id is null
     or p_business_id is null
     or nullif(trim(coalesce(p_activity_type, '')), '') is null
     or not exists (
       select 1 from public.profiles p
       where p.id = actor_id and p.role = 'BUSINESS_OWNER'
     ) then
    return;
  end if;

  select b.* into business_row
  from public.businesses b
  where b.id = p_business_id
    and b.owner_id = actor_id
    and b.lifecycle_state = 'ACTIVE'
  for update;

  if not found then
    return;
  end if;

  perform set_config('app.business_system_write', 'true', true);

  if business_row.status = 'APPROVED'
     and business_row.last_activity_at <= now() - make_interval(days => public.owner_inactivity_days()) then
    update public.businesses
    set lifecycle_state = 'LOCKED',
        locked_at = now(),
        locked_by = null,
        lock_reason = reason_text,
        updated_at = now()
    where id = p_business_id;

    insert into public.shop_lifecycle_audit (
      business_id, action, previous_state, new_state, actor_id, reason
    ) values (
      p_business_id, 'AUTO_LOCK', 'ACTIVE', 'LOCKED', null, reason_text
    );
    return;
  end if;

  update public.businesses
  set last_activity_at = now()
  where id = p_business_id;
end;
$$;

revoke all on function public.touch_business_activity(uuid, text)
  from public, anon, authenticated, service_role;

-- Sign-in enforcement is called by the service-role auth route, but the role
-- check remains inside the database so a caller cannot pass an ADMIN id.
create or replace function public.record_owner_sign_in(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  reason_text text := format(
    'Automatically locked after %s days without meaningful owner activity.',
    public.owner_inactivity_days()
  );
  affected_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'BUSINESS_OWNER'
  ) then
    raise exception 'Business owner account required';
  end if;

  for business_row in
    select b.*
    from public.businesses b
    where b.owner_id = p_user_id
      and b.lifecycle_state = 'ACTIVE'
      and exists (
        select 1 from public.profiles p
        where p.id = b.owner_id and p.role = 'BUSINESS_OWNER'
      )
    for update
  loop
    perform set_config('app.business_system_write', 'true', true);

    if business_row.status = 'APPROVED'
       and business_row.last_activity_at <= now() - make_interval(days => public.owner_inactivity_days()) then
      update public.businesses
      set lifecycle_state = 'LOCKED',
          locked_at = now(),
          locked_by = null,
          lock_reason = reason_text,
          updated_at = now()
      where id = business_row.id;

      insert into public.shop_lifecycle_audit (
        business_id, action, previous_state, new_state, actor_id, reason
      ) values (
        business_row.id, 'AUTO_LOCK', 'ACTIVE', 'LOCKED', null, reason_text
      );
    else
      update public.businesses
      set last_activity_at = now()
      where id = business_row.id;
    end if;

    affected_count := affected_count + 1;
  end loop;

  return affected_count;
end;
$$;

revoke all on function public.record_owner_sign_in(uuid) from public, anon, authenticated;
grant execute on function public.record_owner_sign_in(uuid) to service_role;

-- Owner reactivation is also a lazy-lock path. Manual admin locks and
-- archived shops retain their existing restrictions.
create or replace function public.owner_reactivate_shop(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  business_row public.businesses%rowtype;
  last_lock_action text;
  reason_text text := 'Reactivated manually by the shop owner';
begin
  if actor_id is null
     or not exists (
       select 1 from public.profiles p
       where p.id = actor_id and p.role = 'BUSINESS_OWNER'
     ) then
    raise exception 'Business owner access required';
  end if;

  select b.* into business_row
  from public.businesses b
  where b.id = p_business_id
    and b.owner_id = actor_id
  for update;

  if not found then
    raise exception 'Shop not found or owner access denied';
  end if;
  if business_row.status <> 'APPROVED' then
    raise exception 'Only approved shops can be reactivated';
  end if;
  if business_row.lifecycle_state = 'ARCHIVED' then
    raise exception 'Archived shops cannot be reactivated';
  end if;

  select a.action into last_lock_action
  from public.shop_lifecycle_audit a
  where a.business_id = p_business_id
    and a.new_state = 'LOCKED'
    and a.action in ('AUTO_LOCK', 'MANUAL_LOCK')
  order by a.created_at desc, a.id desc
  limit 1;

  if business_row.lifecycle_state = 'LOCKED'
     and last_lock_action = 'MANUAL_LOCK' then
    raise exception 'This shop was locked by an administrator and requires admin reactivation';
  end if;

  perform set_config('app.business_system_write', 'true', true);

  -- Persist a stale ACTIVE row before unlocking it. This covers an owner who
  -- kept an old tab open while the daily scheduler was unavailable.
  if business_row.lifecycle_state = 'ACTIVE'
     and business_row.last_activity_at <= now() - make_interval(days => public.owner_inactivity_days()) then
    update public.businesses
    set lifecycle_state = 'LOCKED',
        locked_at = now(),
        locked_by = null,
        lock_reason = format(
          'Automatically locked after %s days without meaningful owner activity.',
          public.owner_inactivity_days()
        ),
        updated_at = now()
    where id = p_business_id;

    insert into public.shop_lifecycle_audit (
      business_id, action, previous_state, new_state, actor_id, reason
    ) values (
      p_business_id,
      'AUTO_LOCK',
      'ACTIVE',
      'LOCKED',
      null,
      format('Automatically locked after %s days without meaningful owner activity.', public.owner_inactivity_days())
    );
    business_row.lifecycle_state := 'LOCKED';
  end if;

  if business_row.lifecycle_state <> 'LOCKED' then
    raise exception 'Shop is already active';
  end if;

  update public.businesses
  set lifecycle_state = 'ACTIVE',
      last_activity_at = now(),
      updated_at = now()
  where id = p_business_id;

  insert into public.shop_lifecycle_audit (
    business_id, action, previous_state, new_state, actor_id, reason
  ) values (
    p_business_id, 'UNLOCK', 'LOCKED', 'ACTIVE', actor_id, reason_text
  );

  return jsonb_build_object(
    'business_id', p_business_id,
    'lifecycle_state', 'ACTIVE',
    'action', 'UNLOCK'
  );
end;
$$;

revoke all on function public.owner_reactivate_shop(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.owner_reactivate_shop(uuid) to authenticated;

-- Replace the old argument order so PostgREST exposes the signature expected
-- by the Owner Orders page: (p_next_status text, p_order_id uuid).
drop function if exists public.owner_advance_order_status(uuid, text);
drop function if exists public.owner_advance_order_status(text, uuid);

create function public.owner_advance_order_status(
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

  update public.orders
  set status = next_status
  where id = p_order_id;

  return query select o.* from public.orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.owner_advance_order_status(text, uuid)
  from public, anon;
grant execute on function public.owner_advance_order_status(text, uuid) to authenticated;

-- Notify PostgREST to refresh its function metadata after the migration.
notify pgrst, 'reload schema';

commit;
