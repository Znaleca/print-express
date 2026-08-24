-- Press & Present owner operating-hours access and unlock safety.

begin;

-- An admin unlock starts a fresh activity window. Otherwise an old inactive
-- timestamp would cause the next scheduler run to lock the shop again.
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
      last_activity_at = case when next_state = 'ACTIVE' then now() else last_activity_at end,
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

alter table public.business_hours enable row level security;

drop policy if exists "Owners manage own business hours" on public.business_hours;
create policy "Owners manage own business hours"
on public.business_hours for all
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = business_hours.business_id
      and b.owner_id = auth.uid()
      and b.lifecycle_state = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.businesses b
    where b.id = business_hours.business_id
      and b.owner_id = auth.uid()
      and b.lifecycle_state = 'ACTIVE'
  )
);

drop policy if exists "Admins can view business hours" on public.business_hours;
create policy "Admins can view business hours"
on public.business_hours for select
to authenticated
using (public.is_admin());

drop policy if exists "Public can view active business hours" on public.business_hours;
create policy "Public can view active business hours"
on public.business_hours for select
to anon, authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = business_hours.business_id
      and b.status = 'APPROVED'
      and b.lifecycle_state = 'ACTIVE'
  )
);

commit;
