-- Let approved owners request either profile field independently. Admins review
-- the requested fields first, then apply all accepted changes atomically.

begin;

alter table public.business_profile_change_requests
  alter column requested_description drop not null,
  alter column requested_products_summary drop not null,
  add column if not exists change_scope text not null default 'BOTH',
  add column if not exists description_review_status text not null default 'PENDING',
  add column if not exists products_review_status text not null default 'PENDING';

update public.business_profile_change_requests
set
  change_scope = case
    when requested_description is not null and requested_products_summary is not null then 'BOTH'
    when requested_description is not null then 'BACKGROUND'
    else 'PRODUCTS'
  end,
  description_review_status = case
    when requested_description is null then 'NOT_REQUESTED'
    when status = 'APPROVED' then 'APPROVED'
    when status = 'REJECTED' then 'REJECTED'
    else 'PENDING'
  end,
  products_review_status = case
    when requested_products_summary is null then 'NOT_REQUESTED'
    when status = 'APPROVED' then 'APPROVED'
    when status = 'REJECTED' then 'REJECTED'
    else 'PENDING'
  end;

alter table public.business_profile_change_requests
  drop constraint if exists business_profile_change_requests_change_scope_check,
  drop constraint if exists business_profile_change_requests_field_status_check,
  drop constraint if exists business_profile_change_requests_requested_fields_check;

alter table public.business_profile_change_requests
  add constraint business_profile_change_requests_change_scope_check
    check (change_scope in ('BACKGROUND', 'PRODUCTS', 'BOTH')),
  add constraint business_profile_change_requests_field_status_check
    check (
      description_review_status in ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED')
      and products_review_status in ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED')
    ),
  add constraint business_profile_change_requests_requested_fields_check
    check (
      (change_scope = 'BACKGROUND'
        and char_length(trim(coalesce(requested_description, ''))) between 20 and 800
        and requested_products_summary is null)
      or (change_scope = 'PRODUCTS'
        and requested_description is null
        and char_length(trim(coalesce(requested_products_summary, ''))) between 10 and 500)
      or (change_scope = 'BOTH'
        and char_length(trim(coalesce(requested_description, ''))) between 20 and 800
        and char_length(trim(coalesce(requested_products_summary, ''))) between 10 and 500)
    );

create or replace function public.prepare_business_profile_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.change_scope := upper(coalesce(new.change_scope, 'BOTH'));
  new.requested_name := null;
  new.status := 'PENDING';
  new.admin_comment := null;
  new.reviewed_at := null;

  if new.change_scope = 'BACKGROUND' then
    new.requested_products_summary := null;
    new.description_review_status := 'PENDING';
    new.products_review_status := 'NOT_REQUESTED';
  elsif new.change_scope = 'PRODUCTS' then
    new.requested_description := null;
    new.description_review_status := 'NOT_REQUESTED';
    new.products_review_status := 'PENDING';
  elsif new.change_scope = 'BOTH' then
    new.description_review_status := 'PENDING';
    new.products_review_status := 'PENDING';
  else
    raise exception 'Invalid profile change scope';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_business_profile_change_request_trigger
  on public.business_profile_change_requests;
create trigger prepare_business_profile_change_request_trigger
before insert on public.business_profile_change_requests
for each row execute function public.prepare_business_profile_change_request();

drop policy if exists "Owners can request business profile changes"
  on public.business_profile_change_requests;
create policy "Owners can request business profile changes"
on public.business_profile_change_requests
for insert to authenticated
with check (
  status = 'PENDING'
  and reviewed_at is null
  and admin_comment is null
  and business_id in (
    select id from public.businesses where owner_id = auth.uid() and status::text = 'APPROVED'
  )
  and (
    (change_scope = 'BACKGROUND' and description_review_status = 'PENDING' and products_review_status = 'NOT_REQUESTED')
    or (change_scope = 'PRODUCTS' and description_review_status = 'NOT_REQUESTED' and products_review_status = 'PENDING')
    or (change_scope = 'BOTH' and description_review_status = 'PENDING' and products_review_status = 'PENDING')
  )
);

create or replace function public.admin_apply_business_profile_change(
  p_request_id uuid,
  p_business_id uuid,
  p_requester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.business_profile_change_requests%rowtype;
  business_row public.businesses%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_requester_id and role = 'ADMIN'
  ) then
    raise exception 'Admin access required';
  end if;

  select * into request_row
  from public.business_profile_change_requests
  where id = p_request_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Profile change request not found';
  end if;
  if request_row.status <> 'PENDING' then
    raise exception 'Profile change request is no longer pending';
  end if;
  if request_row.description_review_status = 'REJECTED'
     or request_row.products_review_status = 'REJECTED' then
    raise exception 'Rejected profile fields cannot be applied';
  end if;
  if request_row.requested_description is not null
     and request_row.description_review_status <> 'APPROVED' then
    raise exception 'Business background must be accepted first';
  end if;
  if request_row.requested_products_summary is not null
     and request_row.products_review_status <> 'APPROVED' then
    raise exception 'Products and services must be accepted first';
  end if;

  update public.businesses
  set
    description = case
      when request_row.requested_description is not null then request_row.requested_description
      else description
    end,
    products_summary = case
      when request_row.requested_products_summary is not null then request_row.requested_products_summary
      else products_summary
    end
  where id = p_business_id
  returning * into business_row;

  if not found then
    raise exception 'Business not found';
  end if;

  update public.business_profile_change_requests
  set status = 'APPROVED', reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', request_row.id,
      'business_id', request_row.business_id,
      'change_scope', request_row.change_scope,
      'requested_description', request_row.requested_description,
      'requested_products_summary', request_row.requested_products_summary,
      'description_review_status', request_row.description_review_status,
      'products_review_status', request_row.products_review_status,
      'reason', request_row.reason,
      'status', 'APPROVED',
      'admin_comment', request_row.admin_comment,
      'created_at', request_row.created_at,
      'reviewed_at', now()
    ),
    'business', jsonb_build_object(
      'id', business_row.id,
      'name', business_row.name,
      'description', business_row.description,
      'products_summary', business_row.products_summary,
      'owner_id', business_row.owner_id,
      'email', business_row.email
    )
  );
end;
$$;

revoke all on function public.admin_apply_business_profile_change(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_apply_business_profile_change(uuid, uuid, uuid)
  to service_role;

commit;
