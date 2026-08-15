-- OTP storage used by /api/auth/send-otp and /api/auth/verify-otp.
-- Run this once in Supabase SQL Editor. It intentionally does not reference
-- SUPER_ADMIN or any role value outside the app_role enum used by this app.

create extension if not exists pgcrypto;

create table if not exists public.otp_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code text not null check (otp_code ~ '^[0-9]{6}$'),
  type text not null check (type in ('signup', 'reset')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists otp_verifications_lookup_idx
  on public.otp_verifications (lower(email), type, created_at desc);

create index if not exists otp_verifications_expiry_idx
  on public.otp_verifications (expires_at);

alter table public.otp_verifications enable row level security;

revoke all on table public.otp_verifications from anon, authenticated;
grant all on table public.otp_verifications to service_role;

-- The API uses the service-role client for this lookup. Keeping this function
-- service-role-only prevents anonymous users from probing account existence.
create or replace function public.get_user_id_by_email(lookup_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(lookup_email))
  limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- Expired rows are harmless, but deleting them keeps the free-tier table small.
create or replace function public.delete_expired_otp_verifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.otp_verifications where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_otp_verifications() from public, anon, authenticated;
grant execute on function public.delete_expired_otp_verifications() to service_role;
