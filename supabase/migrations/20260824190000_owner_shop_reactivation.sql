-- Allow an authenticated shop owner to manually reactivate their own
-- inactivity-locked approved shop. Archived shops remain permanent.

begin;

create or replace function public.owner_reactivate_shop(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  business_row public.businesses%rowtype;
  inactivity_days integer;
  reason_text text := 'Reactivated manually by the shop owner';
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into business_row
  from public.businesses
  where id = p_business_id
    and owner_id = actor_id
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

  select coalesce(s.inactivity_days, 7)
  into inactivity_days
  from public.shop_lifecycle_settings s
  where s.singleton = true;
  inactivity_days := coalesce(inactivity_days, 7);

  perform set_config('app.business_system_write', 'true', true);

  -- A stale ACTIVE row can exist when the owner has kept an old dashboard
  -- session open. Persist the automatic lock before the manual reactivation.
  if business_row.lifecycle_state = 'ACTIVE'
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

commit;
