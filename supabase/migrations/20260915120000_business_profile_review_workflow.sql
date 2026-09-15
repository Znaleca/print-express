-- Review the initial customer-facing business profile before final shop approval.
-- Pending owners may correct these fields; approved owners must use the
-- existing profile-change request workflow.

begin;

alter table public.businesses
  add column if not exists name_review_status text not null default 'PENDING',
  add column if not exists description_review_status text not null default 'PENDING',
  add column if not exists products_review_status text not null default 'PENDING',
  add column if not exists name_admin_comment text,
  add column if not exists description_admin_comment text,
  add column if not exists products_admin_comment text;

alter table public.businesses
  drop constraint if exists businesses_profile_review_status_check;

alter table public.businesses
  add constraint businesses_profile_review_status_check
  check (
    name_review_status in ('PENDING', 'APPROVED', 'REJECTED')
    and description_review_status in ('PENDING', 'APPROVED', 'REJECTED')
    and products_review_status in ('PENDING', 'APPROVED', 'REJECTED')
  );

-- Existing approved shops have already passed the profile review represented
-- by the old workflow. New and still-pending shops remain pending until an
-- Admin explicitly accepts each field.
update public.businesses
set
  name_review_status = case
    when status::text = 'APPROVED' and char_length(trim(coalesce(name, ''))) between 2 and 120 then 'APPROVED'
    else 'PENDING'
  end,
  description_review_status = case
    when status::text = 'APPROVED' and char_length(trim(coalesce(description, ''))) between 20 and 800 then 'APPROVED'
    else 'PENDING'
  end,
  products_review_status = case
    when status::text = 'APPROVED' and char_length(trim(coalesce(products_summary, ''))) between 10 and 500 then 'APPROVED'
    else 'PENDING'
  end;

-- Add the business name to the existing owner change-request workflow.
create table if not exists public.business_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_name text not null check (char_length(trim(requested_name)) between 2 and 120),
  requested_description text not null check (char_length(trim(requested_description)) between 20 and 800),
  requested_products_summary text not null check (char_length(trim(requested_products_summary)) between 10 and 500),
  reason text not null check (char_length(trim(reason)) between 10 and 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.business_profile_change_requests
  add column if not exists requested_name text;

update public.business_profile_change_requests request
set requested_name = coalesce(nullif(trim(request.requested_name), ''), business.name)
from public.businesses business
where business.id = request.business_id
  and request.requested_name is null;

alter table public.business_profile_change_requests
  alter column requested_name set not null;

alter table public.business_profile_change_requests
  drop constraint if exists business_profile_change_requests_requested_name_check;

alter table public.business_profile_change_requests
  add constraint business_profile_change_requests_requested_name_check
  check (char_length(trim(requested_name)) between 2 and 120);

create or replace function public.prevent_owner_business_summary_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if old.status::text = 'APPROVED'
       and (
         old.name is distinct from new.name
         or old.description is distinct from new.description
         or old.products_summary is distinct from new.products_summary
       ) then
      raise exception 'Approved business profile fields require an admin change request.';
    end if;

    if old.name_review_status is distinct from new.name_review_status
       or old.description_review_status is distinct from new.description_review_status
       or old.products_review_status is distinct from new.products_review_status
       or old.name_admin_comment is distinct from new.name_admin_comment
       or old.description_admin_comment is distinct from new.description_admin_comment
       or old.products_admin_comment is distinct from new.products_admin_comment then
      raise exception 'Only an administrator can change business profile review decisions.';
    end if;

    if old.name is distinct from new.name then
      if char_length(trim(coalesce(new.name, ''))) not between 2 and 120 then
        raise exception 'Business name must be between 2 and 120 characters.';
      end if;
      new.name_review_status := 'PENDING';
      new.name_admin_comment := null;
    end if;

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
      and name_review_status = 'APPROVED'
      and description_review_status = 'APPROVED'
      and products_review_status = 'APPROVED'
      and char_length(trim(coalesce(name, ''))) between 2 and 120
      and char_length(trim(coalesce(description, ''))) between 20 and 800
      and char_length(trim(coalesce(products_summary, ''))) between 10 and 500;

    if approved_profile_fields <> 1 then
      raise exception 'Business name, background, and products and services must be approved first';
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
