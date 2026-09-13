begin;

-- Owner-controlled delivery settings. A blank maximum distance means there is
-- no maximum range; all other values are validated by the database as well as
-- by the Owner Shop form.
alter table public.businesses
  add column if not exists delivery_enabled boolean not null default true,
  add column if not exists delivery_base_fee numeric(10,2) not null default 30,
  add column if not exists delivery_included_distance_km numeric(8,2) not null default 3,
  add column if not exists delivery_fee_per_extra_km numeric(10,2) not null default 10,
  add column if not exists delivery_max_distance_km numeric(8,2),
  add column if not exists delivery_distance_rounding text not null default 'CEIL';

alter table public.orders
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists delivery_distance_km numeric(10,2),
  add column if not exists delivery_extra_distance_km numeric(10,2) not null default 0,
  add column if not exists delivery_base_fee numeric(10,2) not null default 0,
  add column if not exists delivery_extra_fee numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_delivery_pricing_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_delivery_pricing_check check (
        delivery_base_fee >= 0
        and delivery_included_distance_km > 0
        and delivery_fee_per_extra_km >= 0
        and (delivery_max_distance_km is null or delivery_max_distance_km >= delivery_included_distance_km)
        and delivery_distance_rounding in ('CEIL', 'ROUND', 'FLOOR')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_fee_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_fee_check check (
        delivery_fee >= 0
        and delivery_extra_distance_km >= 0
        and delivery_base_fee >= 0
        and delivery_extra_fee >= 0
        and (delivery_distance_km is null or delivery_distance_km >= 0)
      );
  end if;
end;
$$;

-- This function is deliberately not callable by clients. It is used only by
-- the protected order-insert trigger below, which recalculates from the
-- authoritative Business row and the customer's saved delivery coordinates.
create or replace function public.calculate_delivery_fee_for_order(
  p_business_id uuid,
  p_delivery_coordinates jsonb
)
returns table (
  distance_km numeric,
  extra_distance_km numeric,
  base_fee numeric,
  extra_fee numeric,
  total_fee numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  customer_lat numeric;
  customer_lng numeric;
  shop_lat numeric;
  shop_lng numeric;
  latitude_delta numeric;
  longitude_delta numeric;
  haversine numeric;
  distance_value numeric;
  extra_distance_value numeric;
  extra_fee_value numeric;
begin
  select * into business_row
  from public.businesses
  where id = p_business_id;

  if not found then
    raise exception 'This shop is unavailable.';
  end if;
  if not coalesce(business_row.delivery_enabled, false) then
    raise exception 'This shop does not offer delivery.';
  end if;
  if business_row.lat is null or business_row.lng is null then
    raise exception 'This shop has not finished its delivery location setup.';
  end if;
  if p_delivery_coordinates is null or jsonb_typeof(p_delivery_coordinates) <> 'object' then
    raise exception 'A valid delivery map location is required.';
  end if;

  begin
    shop_lat := business_row.lat::numeric;
    shop_lng := business_row.lng::numeric;
    customer_lat := (p_delivery_coordinates->>'lat')::numeric;
    customer_lng := (p_delivery_coordinates->>'lng')::numeric;
  exception when others then
    raise exception 'A valid delivery map location is required.';
  end;

  if shop_lat < -90 or shop_lat > 90 or shop_lng < -180 or shop_lng > 180
     or customer_lat < -90 or customer_lat > 90 or customer_lng < -180 or customer_lng > 180 then
    raise exception 'A valid delivery map location is required.';
  end if;

  latitude_delta := radians(customer_lat - shop_lat);
  longitude_delta := radians(customer_lng - shop_lng);
  haversine := power(sin(latitude_delta / 2), 2)
    + cos(radians(shop_lat)) * cos(radians(customer_lat)) * power(sin(longitude_delta / 2), 2);
  distance_value := 6371 * 2 * asin(least(1, sqrt(greatest(0, haversine))));

  if business_row.delivery_max_distance_km is not null
     and distance_value > business_row.delivery_max_distance_km then
    raise exception 'This address is outside the shop''s delivery area. Please choose another address or select pickup.';
  end if;

  extra_distance_value := greatest(0, distance_value - business_row.delivery_included_distance_km);
  extra_distance_value := case coalesce(business_row.delivery_distance_rounding, 'CEIL')
    when 'FLOOR' then floor(extra_distance_value)
    when 'ROUND' then round(extra_distance_value)
    else ceil(extra_distance_value)
  end;
  extra_fee_value := extra_distance_value * business_row.delivery_fee_per_extra_km;

  return query select
    round(distance_value, 2),
    extra_distance_value,
    round(business_row.delivery_base_fee, 2),
    round(extra_fee_value, 2),
    round(business_row.delivery_base_fee + extra_fee_value, 2);
end;
$$;

revoke all on function public.calculate_delivery_fee_for_order(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Apply delivery pricing before every order insert. The checkout RPC still
-- calculates the product/quote total and downpayment, but this trigger adds
-- the server-calculated fee and proportionally recalculates the downpayment so
-- the final amount is atomic and historical orders keep their fee snapshot.
create or replace function public.apply_delivery_fee_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  calculation record;
  original_total numeric := greatest(0, coalesce(new.total, 0));
  original_downpayment numeric := greatest(0, coalesce(new.downpayment_amount, 0));
  downpayment_ratio numeric := 0;
begin
  if upper(coalesce(nullif(trim(new.delivery_type), ''), 'PICKUP')) <> 'DELIVERY' then
    new.delivery_fee := 0;
    new.delivery_distance_km := null;
    new.delivery_extra_distance_km := 0;
    new.delivery_base_fee := 0;
    new.delivery_extra_fee := 0;
    new.total := round(original_total, 2);
    new.downpayment_amount := original_downpayment;
    new.balance_amount := greatest(0, new.total - new.downpayment_amount);
    return new;
  end if;

  if original_total <= 0 then
    downpayment_ratio := 0;
  else
    downpayment_ratio := least(1, original_downpayment / original_total);
  end if;

  select * into calculation
  from public.calculate_delivery_fee_for_order(new.business_id, new.delivery_coordinates);

  new.delivery_fee := calculation.total_fee;
  new.delivery_distance_km := calculation.distance_km;
  new.delivery_extra_distance_km := calculation.extra_distance_km;
  new.delivery_base_fee := calculation.base_fee;
  new.delivery_extra_fee := calculation.extra_fee;
  new.total := round(original_total + calculation.total_fee, 2);
  new.downpayment_amount := round(new.total * downpayment_ratio, 2);
  new.balance_amount := greatest(0, new.total - new.downpayment_amount);
  return new;
end;
$$;

drop trigger if exists orders_apply_delivery_fee_before_insert on public.orders;
create trigger orders_apply_delivery_fee_before_insert
before insert on public.orders
for each row execute function public.apply_delivery_fee_to_order();

revoke all on function public.apply_delivery_fee_to_order() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
