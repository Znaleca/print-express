-- Run this in Supabase SQL Editor.
-- Ensures BUSINESS_OWNER signups always get a pending row in public.businesses.

-- 1) Allow owner to insert their own business row (for client-side insert after signup/login).
alter table public.businesses enable row level security;

drop policy if exists "Owners can insert own business" on public.businesses;
create policy "Owners can insert own business"
on public.businesses
for insert
to authenticated
with check (owner_id = auth.uid());

-- 2) Trigger: when profile is created with BUSINESS_OWNER role, auto-create pending business.
create or replace function public.handle_new_business_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_business_name text;
begin
  if new.role = 'BUSINESS_OWNER' then
    select coalesce(nullif(trim((u.raw_user_meta_data ->> 'business_name')), ''), nullif(trim(new.full_name), '') || '''s Business', 'Pending Business')
    into requested_business_name
    from auth.users u
    where u.id = new.id;

    insert into public.businesses (owner_id, name, status)
    values (new.id, requested_business_name, 'PENDING')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_create_business on public.profiles;
create trigger trg_profiles_auto_create_business
after insert on public.profiles
for each row
execute function public.handle_new_business_owner_profile();
