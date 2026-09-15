-- Shop names are owner-editable at any time. Only the customer-facing
-- background and products/services content requires Admin review.

begin;

alter table public.business_profile_change_requests
  alter column requested_name drop not null;

create or replace function public.prevent_owner_business_summary_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if old.status::text = 'APPROVED'
     and (
       old.description is distinct from new.description
       or old.products_summary is distinct from new.products_summary
     ) then
    raise exception 'Approved business content requires an admin change request.';
  end if;

  if old.description_review_status is distinct from new.description_review_status
     or old.products_review_status is distinct from new.products_review_status
     or old.description_admin_comment is distinct from new.description_admin_comment
     or old.products_admin_comment is distinct from new.products_admin_comment then
    raise exception 'Only an administrator can change business content review decisions.';
  end if;

  if old.name is distinct from new.name
     and char_length(trim(coalesce(new.name, ''))) not between 2 and 120 then
    raise exception 'Business name must be between 2 and 120 characters.';
  end if;

  if old.status::text <> 'APPROVED' then
    if old.description is distinct from new.description then
      if char_length(trim(coalesce(new.description, ''))) not between 20 and 800 then
        raise exception 'Business background must be between 20 and 800 characters.';
      end if;
      new.description_review_status := 'PENDING';
      new.description_admin_comment := null;
    end if;

    if old.products_summary is distinct from new.products_summary then
      if char_length(trim(coalesce(new.products_summary, ''))) not between 10 and 500 then
        raise exception 'Products and services summary must be between 10 and 500 characters.';
      end if;
      new.products_review_status := 'PENDING';
      new.products_admin_comment := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_owner_business_summary_edit_trigger on public.businesses;
create trigger prevent_owner_business_summary_edit_trigger
before update on public.businesses
for each row execute function public.prevent_owner_business_summary_edit();

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
  approved_profile_fields integer;
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

    select count(*) into approved_profile_fields
    from public.businesses
    where id = p_business_id
      and description_review_status = 'APPROVED'
      and products_review_status = 'APPROVED'
      and char_length(trim(coalesce(description, ''))) between 20 and 800
      and char_length(trim(coalesce(products_summary, ''))) between 10 and 500;

    if approved_profile_fields <> 1 then
      raise exception 'Business background and products and services must be approved first';
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
