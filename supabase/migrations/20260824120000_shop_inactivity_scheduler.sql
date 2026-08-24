-- Press & Present automatic inactivity locking.
--
-- The function is intentionally service-role-only. Vercel's protected cron
-- endpoint calls it once per day and the database remains the source of truth.
-- Row locks prevent a concurrent owner update from being overwritten silently.

begin;

create or replace function public.auto_lock_inactive_shops()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.shop_lifecycle_settings%rowtype;
  business_row public.businesses%rowtype;
  locked_count integer := 0;
  cutoff_at timestamptz;
  reason_text text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into settings_row
  from public.shop_lifecycle_settings
  where singleton = true;

  if not found then
    settings_row.inactivity_days := 7;
  end if;

  cutoff_at := now() - make_interval(days => settings_row.inactivity_days);
  reason_text := format(
    'Automatically locked after %s days without meaningful owner activity.',
    settings_row.inactivity_days
  );

  for business_row in
    select b.*
    from public.businesses b
    where b.status = 'APPROVED'
      and b.lifecycle_state = 'ACTIVE'
      and b.last_activity_at <= cutoff_at
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
        business_id,
        action,
        previous_state,
        new_state,
        actor_id,
        reason
      ) values (
        business_row.id,
        'AUTO_LOCK',
        'ACTIVE',
        'LOCKED',
        null,
        reason_text
      );

      locked_count := locked_count + 1;
    end if;
  end loop;

  return locked_count;
end;
$$;

revoke all on function public.auto_lock_inactive_shops()
  from public, anon, authenticated;
grant execute on function public.auto_lock_inactive_shops()
  to service_role;

commit;
