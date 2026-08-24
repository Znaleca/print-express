-- Batched public open-state lookup for customer-facing status badges.

begin;

create or replace function public.get_business_open_states(p_business_ids uuid[])
returns table (business_id uuid, is_open boolean)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, public.is_business_open_now(b.id)
  from public.businesses b
  where b.id = any(coalesce(p_business_ids, array[]::uuid[]))
    and b.status = 'APPROVED'
    and b.lifecycle_state = 'ACTIVE';
$$;

revoke all on function public.get_business_open_states(uuid[]) from public, anon, authenticated;
grant execute on function public.get_business_open_states(uuid[]) to anon, authenticated, service_role;

commit;
