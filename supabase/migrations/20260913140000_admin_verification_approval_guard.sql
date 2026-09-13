-- Keep final shop approval behind the four required document approvals.
-- This is additive so the existing admin status RPC remains available to the
-- rest of the application while gaining the verification invariant.

begin;

create or replace function public.admin_set_business_status(
  p_business_id uuid,
  p_action text,
  p_requester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  new_status public.business_status;
  approved_required_documents integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_requester_id and role = 'ADMIN'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_action not in ('APPROVE', 'REJECT') then
    raise exception 'Invalid business approval action';
  end if;

  select owner_id into target_owner
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'Business not found';
  end if;

  if p_action = 'APPROVE' then
    select count(*) into approved_required_documents
    from public.business_documents
    where business_id = p_business_id
      and doc_type in ('DTI', 'MAYORS_PERMIT', 'BIR', 'VALID_ID')
      and status = 'APPROVED';

    if approved_required_documents <> 4 then
      raise exception 'All four required business documents must be approved first';
    end if;
  end if;

  new_status := case
    when p_action = 'APPROVE' then 'APPROVED'::public.business_status
    else 'REJECTED'::public.business_status
  end;

  update public.businesses
  set status = new_status,
      is_open = case when p_action = 'REJECT' then false else is_open end,
      manual_open_override = case when p_action = 'REJECT' then null else manual_open_override end,
      manual_override_until = case when p_action = 'REJECT' then null else manual_override_until end
  where id = p_business_id;

  if p_action = 'APPROVE' then
    update public.profiles
    set role = 'BUSINESS_OWNER', updated_at = now()
    where id = target_owner;
  end if;

  return jsonb_build_object(
    'business_id', p_business_id,
    'owner_id', target_owner,
    'status', new_status::text
  );
end;
$$;

revoke all on function public.admin_set_business_status(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_business_status(uuid, text, uuid)
  to service_role;

commit;
