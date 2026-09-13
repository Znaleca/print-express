-- Reset a shop's final approval and document decisions as one admin operation.
-- A document status cannot be NULL, so PENDING is the explicit "not reviewed"
-- state used when an administrator wants to review the required files again.

begin;

create or replace function public.admin_revoke_business_verification(
  p_business_id uuid,
  p_requester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  reset_document_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_requester_id and role = 'ADMIN'
  ) then
    raise exception 'Admin access required';
  end if;

  select owner_id into target_owner
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'Business not found';
  end if;

  update public.businesses
  set status = 'REJECTED'::public.business_status,
      is_open = false,
      manual_open_override = null,
      manual_override_until = null
  where id = p_business_id;

  update public.business_documents
  set status = 'PENDING',
      admin_comment = null,
      updated_at = now()
  where business_id = p_business_id
    and doc_type in ('DTI', 'MAYORS_PERMIT', 'BIR', 'VALID_ID');
  get diagnostics reset_document_count = row_count;

  return jsonb_build_object(
    'business_id', p_business_id,
    'owner_id', target_owner,
    'status', 'REJECTED',
    'documents_reset', reset_document_count
  );
end;
$$;

revoke all on function public.admin_revoke_business_verification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_revoke_business_verification(uuid, uuid)
  to service_role;

commit;
