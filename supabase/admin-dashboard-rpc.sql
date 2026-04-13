-- Run this in Supabase SQL Editor.
-- This lets ADMIN/SUPER_ADMIN fetch full dashboard data without service-role key.

create or replace function public.admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  users_json jsonb;
  owner_profiles_json jsonb;
  owner_businesses_json jsonb;
  total_businesses bigint;
begin
  select p.role
  into requester_role
  from public.profiles p
  where p.id = auth.uid();

  if requester_role not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'FORBIDDEN: Admin clearance required.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into users_json
  from (
    select id, email, full_name, role, created_at, updated_at
    from public.profiles
    order by created_at desc
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into owner_profiles_json
  from (
    select id, email, full_name, role, created_at, updated_at
    from public.profiles
    where role = 'BUSINESS_OWNER'
    order by created_at desc
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into owner_businesses_json
  from (
    select id, owner_id, name, status, created_at
    from public.businesses
    order by created_at desc
  ) t;

  select count(*)::bigint
  into total_businesses
  from public.businesses;

  return jsonb_build_object(
    'users', users_json,
    'ownerProfiles', owner_profiles_json,
    'ownerBusinesses', owner_businesses_json,
    'totalBusinesses', coalesce(total_businesses, 0)
  );
end;
$$;

grant execute on function public.admin_dashboard_snapshot() to authenticated;
