-- Enforce shop inactivity lazily from the database instead of using Cron.
-- Customer reads and checkout are blocked as soon as last_activity_at is stale.
-- A persisted LOCKED state is written when the owner signs in or performs an
-- owner action after the inactivity threshold.

begin;

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
      and b.last_activity_at <= now() - make_interval(
        days => coalesce(
          (select s.inactivity_days
           from public.shop_lifecycle_settings s
           where s.singleton = true),
          7
        )
      )
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

revoke all on function public.is_business_inactivity_expired(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_business_customer_visible(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_business_inactivity_expired(uuid)
  to anon, authenticated, service_role;
grant execute on function public.is_business_customer_visible(uuid)
  to anon, authenticated, service_role;

-- Customer-facing RLS always evaluates the timestamp, so stale shops cannot
-- appear even before a background job or owner/admin request changes the row.
drop policy if exists "Public can view active approved businesses" on public.businesses;
create policy "Public can view active approved businesses"
on public.businesses
for select
to anon, authenticated
using (public.is_business_customer_visible(id));

drop policy if exists "Public can view active approved services" on public.services;
create policy "Public can view active approved services"
on public.services
for select
to anon, authenticated
using (public.is_business_customer_visible(business_id));

drop policy if exists "Public can view active pricing rules" on public.service_pricing_rules;
create policy "Public can view active pricing rules"
on public.service_pricing_rules
for select
to anon, authenticated
using (
  active = true
  and public.is_business_customer_visible(business_id)
);

create or replace view public.business_reviews as
select
  o.id as order_id,
  o.business_id,
  o.rating,
  o.feedback,
  o.feedback_hidden,
  o.feedback_hidden_at,
  o.feedback_hidden_by,
  o.created_at,
  p.full_name as customer_name
from public.orders o
join public.businesses b on b.id = o.business_id
left join public.profiles p on o.customer_id = p.id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null
  and coalesce(o.feedback_hidden, false) = false
  and public.is_business_customer_visible(o.business_id);

grant select on public.business_reviews to anon, authenticated;

-- Defense in depth for any server-side order insertion path. The existing
-- atomic checkout still locks the business row first; this trigger also blocks
-- direct inserts and stale shops before an order can be committed.
create or replace function public.reject_inactive_shop_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_business_customer_visible(new.business_id) then
    raise exception 'This shop is not available';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_inactive_shop_orders on public.orders;
create trigger reject_inactive_shop_orders
before insert on public.orders
for each row execute function public.reject_inactive_shop_orders();

revoke all on function public.reject_inactive_shop_orders() from public, anon, authenticated;

-- Persist the lock the next time a stale owner signs in or performs a
-- meaningful owner action. This keeps owner sessions valid while preventing
-- the sign-in/action itself from refreshing an already-expired shop.
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
  inactivity_days integer;
begin
  if actor_id is null or p_business_id is null then
    return;
  end if;

  if nullif(trim(coalesce(p_activity_type, '')), '') is null then
    return;
  end if;

  select * into business_row
  from public.businesses
  where id = p_business_id
    and owner_id = actor_id
  for update;

  if not found or business_row.lifecycle_state <> 'ACTIVE' then
    return;
  end if;

  select coalesce(s.inactivity_days, 7)
  into inactivity_days
  from public.shop_lifecycle_settings s
  where s.singleton = true;
  inactivity_days := coalesce(inactivity_days, 7);

  perform set_config('app.business_system_write', 'true', true);
  perform set_config('app.business_activity_type', p_activity_type, true);

  if business_row.status = 'APPROVED'
     and business_row.last_activity_at <= now() - make_interval(days => inactivity_days) then
    update public.businesses
    set lifecycle_state = 'LOCKED',
        locked_at = now(),
        locked_by = null,
        lock_reason = format(
          'Automatically locked after %s days without meaningful owner activity.',
          inactivity_days
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
      format('Automatically locked after %s days without meaningful owner activity.', inactivity_days)
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

create or replace function public.record_owner_sign_in(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  inactivity_days integer;
  affected_count integer := 0;
  automatic_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'BUSINESS_OWNER'
  ) then
    raise exception 'Business owner account required';
  end if;

  select coalesce(s.inactivity_days, 7)
  into inactivity_days
  from public.shop_lifecycle_settings s
  where s.singleton = true;
  inactivity_days := coalesce(inactivity_days, 7);
  automatic_reason := format(
    'Automatically locked after %s days without meaningful owner activity.',
    inactivity_days
  );

  for business_row in
    select *
    from public.businesses
    where owner_id = p_user_id
      and lifecycle_state = 'ACTIVE'
    for update
  loop
    perform set_config('app.business_system_write', 'true', true);

    if business_row.status = 'APPROVED'
       and business_row.last_activity_at <= now() - make_interval(days => inactivity_days) then
      update public.businesses
      set lifecycle_state = 'LOCKED',
          locked_at = now(),
          locked_by = null,
          lock_reason = automatic_reason,
          updated_at = now()
      where id = business_row.id;

      insert into public.shop_lifecycle_audit (
        business_id, action, previous_state, new_state, actor_id, reason
      ) values (
        business_row.id, 'AUTO_LOCK', 'ACTIVE', 'LOCKED', null, automatic_reason
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

revoke all on function public.record_owner_sign_in(uuid)
  from public, anon, authenticated;
grant execute on function public.record_owner_sign_in(uuid) to service_role;

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

revoke all on function public.get_business_open_states(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_business_open_states(uuid[])
  to anon, authenticated, service_role;

commit;
