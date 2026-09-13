-- Admin operations dashboard aggregates.
-- The API passes the already-authenticated admin id explicitly because the
-- server route uses the service-role client after validating the bearer token.

begin;

create index if not exists profiles_role_created_at_idx
  on public.profiles (role, created_at desc);

create index if not exists businesses_status_created_at_idx
  on public.businesses (status, created_at desc);

create index if not exists businesses_lifecycle_status_created_at_idx
  on public.businesses (lifecycle_state, status, created_at desc);

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists category_approval_requests_status_created_at_idx
  on public.category_approval_requests (status, created_at desc);

create index if not exists business_profile_change_requests_status_created_at_idx
  on public.business_profile_change_requests (status, created_at desc);

create or replace function public.admin_operations_snapshot(
  p_requester_id uuid,
  p_range_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  range_start timestamptz;
  bucket_unit text;
  total_customers bigint;
  total_business_owners bigint;
  total_shops bigint;
  pending_verifications bigint;
  pending_category_approvals bigint;
  total_orders bigint;
  completed_orders bigint;
  active_shops bigint;
  locked_shops bigint;
  completed_revenue numeric;
  user_growth_json jsonb;
  order_activity_json jsonb;
  orders_by_status_json jsonb;
  shop_verification_json jsonb;
  category_approval_json jsonb;
  pending_verifications_json jsonb;
  pending_categories_json jsonb;
  recent_profile_requests_json jsonb;
  attention_shops_json jsonb;
  refund_items_json jsonb;
  recent_customers_json jsonb;
  recent_business_owners_json jsonb;
  recent_shops_json jsonb;
  recent_orders_json jsonb;
begin
  if p_range_days is not null and p_range_days not in (7, 30, 90) then
    raise exception 'Invalid dashboard range';
  end if;

  select p.role
  into requester_role
  from public.profiles p
  where p.id = p_requester_id;

  if requester_role <> 'ADMIN' then
    raise exception 'FORBIDDEN: Admin clearance required.';
  end if;

  range_start := case
    when p_range_days is null then null
    else now() - make_interval(days => p_range_days)
  end;

  bucket_unit := case
    when p_range_days is null or p_range_days = 90 then 'month'
    when p_range_days = 30 then 'week'
    else 'day'
  end;

  select count(*) into total_customers
  from public.profiles where role = 'CUSTOMER';

  select count(*) into total_business_owners
  from public.profiles where role = 'BUSINESS_OWNER';

  select count(*) into total_shops
  from public.businesses;

  select count(*) into pending_verifications
  from public.businesses where status = 'PENDING';

  select count(*) into pending_category_approvals
  from public.category_approval_requests where status = 'PENDING';

  select count(*) into total_orders
  from public.orders;

  select count(*) into completed_orders
  from public.orders where status in ('COMPLETED', 'DELIVERY_COMPLETED');

  select count(*) into active_shops
  from public.businesses where status = 'APPROVED' and lifecycle_state = 'ACTIVE';

  select count(*) into locked_shops
  from public.businesses where status = 'APPROVED' and lifecycle_state = 'LOCKED';

  select coalesce(sum(total), 0) into completed_revenue
  from public.orders where status in ('COMPLETED', 'DELIVERY_COMPLETED');

  select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb)
  into user_growth_json
  from (
    select
      date_trunc(bucket_unit, p.created_at at time zone 'UTC')::date as bucket,
      count(*) filter (where p.role = 'CUSTOMER')::bigint as customers,
      count(*) filter (where p.role = 'BUSINESS_OWNER')::bigint as business_owners,
      count(*)::bigint as total
    from public.profiles p
    where p.role in ('CUSTOMER', 'BUSINESS_OWNER')
      and (range_start is null or p.created_at >= range_start)
    group by 1
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb)
  into order_activity_json
  from (
    select
      date_trunc(bucket_unit, o.created_at at time zone 'UTC')::date as bucket,
      count(*)::bigint as orders,
      coalesce(sum(o.total), 0) as order_value,
      coalesce(sum(o.total) filter (where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')), 0) as completed_revenue
    from public.orders o
    where range_start is null or o.created_at >= range_start
    group by 1
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.count desc, t.status), '[]'::jsonb)
  into orders_by_status_json
  from (
    select o.status, count(*)::bigint as count
    from public.orders o
    where range_start is null or o.created_at >= range_start
    group by o.status
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.count desc, t.status), '[]'::jsonb)
  into shop_verification_json
  from (
    select b.status, count(*)::bigint as count
    from public.businesses b
    group by b.status
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.count desc, t.status), '[]'::jsonb)
  into category_approval_json
  from (
    select c.status, count(*)::bigint as count
    from public.category_approval_requests c
    group by c.status
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into pending_verifications_json
  from (
    select b.id, b.name, b.status, b.created_at, p.full_name as owner_name
    from public.businesses b
    left join public.profiles p on p.id = b.owner_id
    where b.status = 'PENDING'
    order by b.created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into pending_categories_json
  from (
    select c.id, c.category_name, c.status, c.reason, c.created_at,
      b.name as business_name
    from public.category_approval_requests c
    left join public.businesses b on b.id = c.business_id
    where c.status = 'PENDING'
    order by c.created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into recent_profile_requests_json
  from (
    select r.id, r.status, r.reason, r.created_at, b.name as business_name
    from public.business_profile_change_requests r
    left join public.businesses b on b.id = r.business_id
    order by r.created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into attention_shops_json
  from (
    select b.id, b.name, b.status, b.lifecycle_state, b.created_at,
      b.last_activity_at, b.lock_reason
    from public.businesses b
    where b.status = 'REJECTED'
       or (b.status = 'APPROVED' and b.lifecycle_state in ('LOCKED', 'ARCHIVED'))
    order by coalesce(b.last_activity_at, b.created_at) desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into refund_items_json
  from (
    select o.id, o.status, o.total, o.created_at, b.name as business_name
    from public.orders o
    left join public.businesses b on b.id = o.business_id
    where o.status in ('CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_CONFIRMED')
    order by o.created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into recent_customers_json
  from (
    select id, full_name, email, role, created_at
    from public.profiles
    where role = 'CUSTOMER'
    order by created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into recent_business_owners_json
  from (
    select id, full_name, email, role, created_at
    from public.profiles
    where role = 'BUSINESS_OWNER'
    order by created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into recent_shops_json
  from (
    select id, name, status, lifecycle_state, created_at
    from public.businesses
    order by created_at desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into recent_orders_json
  from (
    select o.id, o.status, o.total, o.created_at, b.name as business_name
    from public.orders o
    left join public.businesses b on b.id = o.business_id
    order by o.created_at desc
    limit 5
  ) t;

  return jsonb_build_object(
    'generatedAt', now(),
    'rangeDays', p_range_days,
    'kpis', jsonb_build_object(
      'totalCustomers', coalesce(total_customers, 0),
      'totalBusinessOwners', coalesce(total_business_owners, 0),
      'totalShops', coalesce(total_shops, 0),
      'pendingVerifications', coalesce(pending_verifications, 0),
      'pendingCategoryApprovals', coalesce(pending_category_approvals, 0),
      'totalOrders', coalesce(total_orders, 0),
      'completedOrders', coalesce(completed_orders, 0),
      'activeShops', coalesce(active_shops, 0),
      'lockedShops', coalesce(locked_shops, 0),
      'completedRevenue', coalesce(completed_revenue, 0)
    ),
    'charts', jsonb_build_object(
      'userGrowth', user_growth_json,
      'orderActivity', order_activity_json,
      'ordersByStatus', orders_by_status_json,
      'shopVerification', shop_verification_json,
      'categoryApproval', category_approval_json
    ),
    'actions', jsonb_build_object(
      'pendingVerifications', pending_verifications_json,
      'pendingCategoryApprovals', pending_categories_json,
      'recentProfileRequests', recent_profile_requests_json,
      'attentionShops', attention_shops_json,
      'refundItems', refund_items_json
    ),
    'recent', jsonb_build_object(
      'customers', recent_customers_json,
      'businessOwners', recent_business_owners_json,
      'shops', recent_shops_json,
      'orders', recent_orders_json
    )
  );
end;
$$;

revoke all on function public.admin_operations_snapshot(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.admin_operations_snapshot(uuid, integer)
  to service_role;

commit;
