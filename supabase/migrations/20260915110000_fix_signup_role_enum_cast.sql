begin;

-- Auth inserts the role metadata as text, while profiles.role is the
-- public.app_role enum. Without the explicit cast, Supabase Auth rolls back
-- the auth.users insert and reports a generic unexpected_failure.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, updated_at)
  values (
    new.id,
    lower(trim(new.email)),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    (case
      when new.raw_user_meta_data ->> 'role' in ('CUSTOMER', 'BUSINESS_OWNER')
        then new.raw_user_meta_data ->> 'role'
      else 'CUSTOMER'
    end)::public.app_role,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

commit;
