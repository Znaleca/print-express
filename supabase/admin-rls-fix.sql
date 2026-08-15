-- Run this in Supabase SQL Editor.
-- Goal: Allow ADMIN profiles to read and manage all profiles/businesses.

-- Use a security-definer helper so policies never query public.profiles from
-- inside another public.profiles policy (which causes infinite recursion).
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

-- Drop old conflicting policies if they exist.
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can read all businesses" on public.businesses;
drop policy if exists "Admins can update all businesses" on public.businesses;

-- Admin can read all profiles.
create policy "Admins can read all profiles" on public.profiles for select to authenticated using (public.is_admin());

-- Admin can update all profiles.
create policy "Admins can update all profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin can read all businesses.
create policy "Admins can read all businesses" on public.businesses for select to authenticated using (public.is_admin());

-- Admin can update all businesses.
create policy "Admins can update all businesses" on public.businesses for update to authenticated using (public.is_admin()) with check (public.is_admin());
