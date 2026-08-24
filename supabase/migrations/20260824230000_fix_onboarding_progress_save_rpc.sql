begin;

-- PL/pgSQL requires RETURN QUERY when an INSERT/UPDATE ... RETURNING
-- statement is used to return rows from a set-returning function.
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

  return query
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

revoke all on function public.save_my_onboarding_progress(text, text, integer, text) from public, anon;
grant execute on function public.save_my_onboarding_progress(text, text, integer, text) to authenticated;

commit;
