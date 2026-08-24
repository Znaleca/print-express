-- Secure, resumable first-time user onboarding state.
-- Progress is scoped to the authenticated user, application role, and
-- tutorial version so customer and business-owner tutorials remain separate.

begin;

create table if not exists public.onboarding_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('CUSTOMER', 'BUSINESS_OWNER')),
  tutorial_version text not null check (char_length(trim(tutorial_version)) between 1 and 32),
  current_step integer not null default 0 check (current_step between 0 and 50),
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  last_seen_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role, tutorial_version)
);

create index if not exists onboarding_progress_user_idx
  on public.onboarding_progress (user_id, role, updated_at desc);

create or replace function public.set_onboarding_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_onboarding_progress_updated_at on public.onboarding_progress;
create trigger set_onboarding_progress_updated_at
before update on public.onboarding_progress
for each row execute function public.set_onboarding_progress_updated_at();

alter table public.onboarding_progress enable row level security;

drop policy if exists "Users can view their onboarding progress" on public.onboarding_progress;
create policy "Users can view their onboarding progress"
on public.onboarding_progress
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their onboarding progress" on public.onboarding_progress;
create policy "Users can insert their onboarding progress"
on public.onboarding_progress
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role::text = (
    select p.role::text
    from public.profiles p
    where p.id = auth.uid()
  )
);

drop policy if exists "Users can update their onboarding progress" on public.onboarding_progress;
create policy "Users can update their onboarding progress"
on public.onboarding_progress
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and role::text = (
    select p.role::text
    from public.profiles p
    where p.id = auth.uid()
  )
);

-- There is intentionally no DELETE policy. Restarting a tutorial resets its
-- state through the guarded function below and preserves the audit trail.
revoke all on table public.onboarding_progress from anon;
revoke all on table public.onboarding_progress from authenticated;
grant select on table public.onboarding_progress to authenticated;

create or replace function public.assert_my_onboarding_role(p_role text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actual_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('CUSTOMER', 'BUSINESS_OWNER') then
    raise exception 'Unsupported onboarding role';
  end if;

  select p.role::text
  into actual_role
  from public.profiles p
  where p.id = auth.uid();

  if actual_role is distinct from p_role then
    raise exception 'Onboarding role does not match the authenticated profile';
  end if;
end;
$$;

create or replace function public.get_my_onboarding_state(
  p_role text,
  p_tutorial_version text
)
returns setof public.onboarding_progress
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_my_onboarding_role(p_role);

  if p_tutorial_version is null
     or char_length(trim(p_tutorial_version)) not between 1 and 32 then
    raise exception 'Invalid tutorial version';
  end if;

  return query
  select op.*
  from public.onboarding_progress op
  where op.user_id = auth.uid()
    and op.role = p_role
    and op.tutorial_version = trim(p_tutorial_version);
end;
$$;

create or replace function public.get_or_create_my_onboarding_state(
  p_role text,
  p_tutorial_version text
)
returns setof public.onboarding_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_version text := trim(coalesce(p_tutorial_version, ''));
begin
  perform public.assert_my_onboarding_role(p_role);

  if char_length(normalized_version) not between 1 and 32 then
    raise exception 'Invalid tutorial version';
  end if;

  insert into public.onboarding_progress (
    user_id, role, tutorial_version, current_step, status, last_seen_at
  ) values (
    auth.uid(), p_role, normalized_version, 0, 'NOT_STARTED', now()
  )
  on conflict (user_id, role, tutorial_version) do nothing;

  return query
  select op.*
  from public.onboarding_progress op
  where op.user_id = auth.uid()
    and op.role = p_role
    and op.tutorial_version = normalized_version;
end;
$$;

create or replace function public.save_my_onboarding_progress(
  p_role text,
  p_tutorial_version text,
  p_current_step integer,
  p_status text
)
returns setof public.onboarding_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_version text := trim(coalesce(p_tutorial_version, ''));
  normalized_status text := upper(trim(coalesce(p_status, '')));
begin
  perform public.assert_my_onboarding_role(p_role);

  if char_length(normalized_version) not between 1 and 32 then
    raise exception 'Invalid tutorial version';
  end if;
  if p_current_step is null or p_current_step not between 0 and 50 then
    raise exception 'Invalid onboarding step';
  end if;
  if normalized_status not in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED') then
    raise exception 'Invalid onboarding status';
  end if;

  insert into public.onboarding_progress (
    user_id,
    role,
    tutorial_version,
    current_step,
    status,
    last_seen_at,
    completed_at,
    skipped_at
  ) values (
    auth.uid(),
    p_role,
    normalized_version,
    p_current_step,
    normalized_status,
    now(),
    case when normalized_status = 'COMPLETED' then now() else null end,
    case when normalized_status = 'SKIPPED' then now() else null end
  )
  on conflict (user_id, role, tutorial_version) do update
  set current_step = excluded.current_step,
      status = excluded.status,
      last_seen_at = now(),
      completed_at = case
        when excluded.status = 'COMPLETED' then now()
        else null
      end,
      skipped_at = case
        when excluded.status = 'SKIPPED' then now()
        else null
      end
  returning *;
end;
$$;

create or replace function public.restart_my_onboarding(
  p_role text,
  p_tutorial_version text
)
returns setof public.onboarding_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_version text := trim(coalesce(p_tutorial_version, ''));
begin
  perform public.assert_my_onboarding_role(p_role);

  if char_length(normalized_version) not between 1 and 32 then
    raise exception 'Invalid tutorial version';
  end if;

  insert into public.onboarding_progress (
    user_id, role, tutorial_version, current_step, status, last_seen_at
  ) values (
    auth.uid(), p_role, normalized_version, 0, 'NOT_STARTED', now()
  )
  on conflict (user_id, role, tutorial_version) do update
  set current_step = 0,
      status = 'NOT_STARTED',
      last_seen_at = now(),
      completed_at = null,
      skipped_at = null;

  return query
  select op.*
  from public.onboarding_progress op
  where op.user_id = auth.uid()
    and op.role = p_role
    and op.tutorial_version = normalized_version;
end;
$$;

revoke all on function public.set_onboarding_progress_updated_at() from public, anon, authenticated;
revoke all on function public.assert_my_onboarding_role(text) from public, anon;
revoke all on function public.get_my_onboarding_state(text, text) from public, anon;
revoke all on function public.get_or_create_my_onboarding_state(text, text) from public, anon;
revoke all on function public.save_my_onboarding_progress(text, text, integer, text) from public, anon;
revoke all on function public.restart_my_onboarding(text, text) from public, anon;

grant execute on function public.get_my_onboarding_state(text, text) to authenticated;
grant execute on function public.get_or_create_my_onboarding_state(text, text) to authenticated;
grant execute on function public.save_my_onboarding_progress(text, text, integer, text) to authenticated;
grant execute on function public.restart_my_onboarding(text, text) to authenticated;

-- Existing accounts should not be interrupted by the first onboarding release.
-- New tutorial versions can be introduced later without modifying these rows.
insert into public.onboarding_progress (
  user_id, role, tutorial_version, current_step, status, skipped_at
)
select
  p.id,
  p.role::text,
  'v1',
  0,
  'SKIPPED',
  now()
from public.profiles p
where p.role::text in ('CUSTOMER', 'BUSINESS_OWNER')
on conflict (user_id, role, tutorial_version) do nothing;

commit;
