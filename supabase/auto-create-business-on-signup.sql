-- Compatibility setup for installations that apply standalone SQL files.
-- Prefer applying supabase/migrations/20260912100000_auth_account_flows.sql.
-- Account creation uses Supabase email confirmation and database-owned rows.

alter table public.businesses enable row level security;

create unique index if not exists businesses_owner_id_unique_idx
  on public.businesses (owner_id)
  where owner_id is not null;

create or replace function public.handle_new_business_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_business_name text;
  requested_business_background text;
  requested_products_summary text;
begin
  if new.role::text = 'BUSINESS_OWNER' then
    select
      coalesce(nullif(trim((u.raw_user_meta_data ->> 'business_name')), ''), nullif(trim(new.full_name), '') || '''s Business', 'Pending Business'),
      nullif(trim((u.raw_user_meta_data ->> 'business_background')), ''),
      nullif(trim((u.raw_user_meta_data ->> 'products_summary')), '')
    into requested_business_name, requested_business_background, requested_products_summary
    from auth.users u
    where u.id = new.id;

    insert into public.businesses (owner_id, name, description, products_summary, status)
    values (new.id, requested_business_name, requested_business_background, requested_products_summary, 'PENDING')
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

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_auth_user_create_profile on auth.users;
create trigger trg_auth_user_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();

revoke all on function public.handle_new_business_owner_profile() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

drop policy if exists "Owners can insert own business" on public.businesses;
