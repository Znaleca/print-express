-- Run this in Supabase SQL Editor.
-- Goal: Allow ADMIN/SUPER_ADMIN profiles to read and manage all profiles/businesses.

-- Drop old conflicting policies if they exist.
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can read all businesses" on public.businesses;
drop policy if exists "Admins can update all businesses" on public.businesses;

-- Admin can read all profiles.
create policy "Admins can read all profiles"
on public.profiles
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Admin can update all profiles.
create policy "Admins can update all profiles"
on public.profiles
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Admin can read all businesses.
create policy "Admins can read all businesses"
on public.businesses
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Admin can update all businesses.
create policy "Admins can update all businesses"
on public.businesses
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'SUPER_ADMIN')
  )
);
