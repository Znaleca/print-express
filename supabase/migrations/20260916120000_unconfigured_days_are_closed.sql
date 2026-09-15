-- Weekly hours are authoritative whenever the owner is following the schedule.
-- An unconfigured day is closed. Overnight hours are checked against both the
-- current day and the previous day's closing boundary.
create or replace function public.is_business_open_now(p_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  hours_row public.business_hours%rowtype;
  previous_hours_row public.business_hours%rowtype;
  local_now timestamp;
  local_time time;
  current_day smallint;
  previous_day smallint;
begin
  select * into business_row
  from public.businesses
  where id = p_business_id;

  if not found then
    return false;
  end if;

  if business_row.manual_open_override is false
     and (business_row.manual_override_until is null or business_row.manual_override_until > now()) then
    return false;
  end if;

  if business_row.is_open is false then
    return false;
  end if;

  begin
    local_now := now() at time zone coalesce(nullif(business_row.timezone, ''), 'Asia/Manila');
  exception when invalid_parameter_value then
    local_now := now() at time zone 'Asia/Manila';
  end;

  local_time := local_now::time;
  current_day := extract(dow from local_now)::smallint;
  previous_day := ((current_day + 6) % 7)::smallint;

  select * into hours_row
  from public.business_hours
  where business_id = p_business_id
    and day_of_week = current_day;

  if found and not hours_row.is_closed
     and hours_row.opens_at is not null
     and hours_row.closes_at is not null then
    if hours_row.opens_at < hours_row.closes_at
       and local_time >= hours_row.opens_at
       and local_time < hours_row.closes_at then
      return true;
    end if;

    if hours_row.opens_at > hours_row.closes_at
       and local_time >= hours_row.opens_at then
      return true;
    end if;
  end if;

  select * into previous_hours_row
  from public.business_hours
  where business_id = p_business_id
    and day_of_week = previous_day;

  return found
     and not previous_hours_row.is_closed
     and previous_hours_row.opens_at is not null
     and previous_hours_row.closes_at is not null
     and previous_hours_row.opens_at > previous_hours_row.closes_at
     and local_time < previous_hours_row.closes_at;
end;
$$;

revoke all on function public.is_business_open_now(uuid) from public, anon;
grant execute on function public.is_business_open_now(uuid) to authenticated, service_role;
