-- OTP security hardening for Issues 7 and 8.

begin;

alter table if exists public.otp_verifications
  add column if not exists otp_hash text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists request_ip_hash text,
  add column if not exists request_device_hash text;

alter table if exists public.otp_verifications
  drop constraint if exists otp_verifications_otp_code_check;

-- Remove the legacy plaintext column entirely. Existing rows no longer retain
-- usable codes, and the hardened API stores only HMAC digests.
alter table if exists public.otp_verifications
  drop column if exists otp_code;

create index if not exists otp_verifications_ip_idx
  on public.otp_verifications (request_ip_hash, created_at desc);

create table if not exists public.otp_rate_limits (
  scope text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.otp_rate_limits enable row level security;
revoke all on table public.otp_rate_limits from anon, authenticated;
grant all on table public.otp_rate_limits to service_role;

create or replace function public.consume_otp_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.otp_rate_limits%rowtype;
  next_count integer;
begin
  select * into current_row
  from public.otp_rate_limits
  where scope = p_scope
  for update;

  if not found or current_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    insert into public.otp_rate_limits(scope, window_started_at, request_count, updated_at)
    values (p_scope, now(), 1, now())
    on conflict (scope) do update
      set window_started_at = excluded.window_started_at,
          request_count = excluded.request_count,
          updated_at = excluded.updated_at;
    return true;
  end if;

  next_count := current_row.request_count + 1;
  update public.otp_rate_limits
  set request_count = next_count, updated_at = now()
  where scope = p_scope;

  return next_count <= p_limit;
end;
$$;

create or replace function public.register_otp_attempt(p_otp_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
  allowed_attempts integer;
begin
  select attempt_count, max_attempts
    into current_attempts, allowed_attempts
  from public.otp_verifications
  where id = p_otp_id
  for update;

  if not found then return false; end if;

  current_attempts := current_attempts + 1;
  update public.otp_verifications
  set attempt_count = current_attempts
  where id = p_otp_id;

  if current_attempts >= allowed_attempts then
    delete from public.otp_verifications where id = p_otp_id;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_otp_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.register_otp_attempt(uuid) from public, anon, authenticated;
grant execute on function public.consume_otp_rate_limit(text, integer, integer) to service_role;
grant execute on function public.register_otp_attempt(uuid) to service_role;

commit;
