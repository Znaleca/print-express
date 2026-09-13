begin;

-- Email is normalized by the API, but auth.users remains the authoritative
-- uniqueness boundary. This index also makes the one-business-per-owner rule
-- explicit for all future writes.
create unique index if not exists businesses_owner_id_unique_idx
  on public.businesses (owner_id)
  where owner_id is not null;

-- This lookup is available only to the server-side service-role client. It
-- returns the minimum state needed to give signup/login useful messages and
-- never returns an email, password, metadata, or other account details.
create or replace function public.get_auth_user_status_by_email(lookup_email text)
returns table (
  user_id uuid,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email_confirmed_at,
    u.banned_until,
    u.deleted_at
  from auth.users u
  where lower(u.email) = lower(trim(lookup_email))
  limit 1;
$$;

revoke all on function public.get_auth_user_status_by_email(text) from public, anon, authenticated;
grant execute on function public.get_auth_user_status_by_email(text) to service_role;

-- Business creation belongs to the database transaction that creates the
-- profile. A retry or two simultaneous signup requests therefore cannot leave
-- a second profile/business behind. The unique owner index above protects
-- against future writers outside this trigger as well.
create or replace function public.handle_new_business_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_business_name text;
  requested_business_background text;
  requested_products_summary text;
begin
  if new.role::text <> 'BUSINESS_OWNER' then
    return new;
  end if;

  select
    coalesce(
      nullif(trim((u.raw_user_meta_data ->> 'business_name')), ''),
      nullif(trim(new.full_name), '') || '''s Business',
      'Pending Business'
    ),
    nullif(trim((u.raw_user_meta_data ->> 'business_background')), ''),
    nullif(trim((u.raw_user_meta_data ->> 'products_summary')), '')
  into requested_business_name, requested_business_background, requested_products_summary
  from auth.users u
  where u.id = new.id;

  insert into public.businesses (owner_id, name, description, products_summary, status)
  values (
    new.id,
    coalesce(requested_business_name, 'Pending Business'),
    requested_business_background,
    requested_products_summary,
    'PENDING'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_create_business on public.profiles;
create trigger trg_profiles_auto_create_business
after insert on public.profiles
for each row
execute function public.handle_new_business_owner_profile();

-- The auth trigger is the only profile creation path used by signup. It runs
-- inside the auth.users transaction, so a profile/business failure rolls back
-- the account instead of producing an orphaned row.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, updated_at)
  values (
    new.id,
    lower(trim(new.email)),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('CUSTOMER', 'BUSINESS_OWNER')
        then new.raw_user_meta_data ->> 'role'
      else 'CUSTOMER'
    end,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Replace common legacy profile triggers so an older signup path cannot race
-- the canonical role-aware profile creation trigger.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_auth_user_create_profile on auth.users;
create trigger trg_auth_user_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();

revoke all on function public.handle_new_business_owner_profile() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

-- Client-side owner inserts are no longer part of account creation. The
-- profile trigger above is the protected source of truth for this record.
drop policy if exists "Owners can insert own business" on public.businesses;

commit;
