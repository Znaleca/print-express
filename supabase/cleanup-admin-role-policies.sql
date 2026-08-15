-- Run this by itself if Supabase still reports SUPER_ADMIN.
-- The text search is against pg_policies metadata, so it does not cast
-- SUPER_ADMIN to the app_role enum.

do $$
declare
  stale_policy record;
begin
  for stale_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%SUPER_ADMIN%'
        or coalesce(with_check, '') ilike '%SUPER_ADMIN%'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      stale_policy.policyname,
      stale_policy.schemaname,
      stale_policy.tablename
    );
  end loop;
end
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can read all businesses" on public.businesses;
drop policy if exists "Admins can update all businesses" on public.businesses;

create policy "Admins can read all profiles" on public.profiles
for select to authenticated using (public.is_admin());

create policy "Admins can update all profiles" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins can read all businesses" on public.businesses
for select to authenticated using (public.is_admin());

create policy "Admins can update all businesses" on public.businesses
for update to authenticated using (public.is_admin()) with check (public.is_admin());
