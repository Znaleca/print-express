-- Controlled business profile changes
-- Run this after add-business-profile-fields.sql.

create table if not exists public.business_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_name text,
  change_scope text not null default 'BOTH' check (change_scope in ('BACKGROUND', 'PRODUCTS', 'BOTH')),
  requested_description text check (char_length(trim(requested_description)) between 20 and 800),
  requested_products_summary text check (char_length(trim(requested_products_summary)) between 10 and 500),
  description_review_status text not null default 'PENDING' check (description_review_status in ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED')),
  products_review_status text not null default 'PENDING' check (products_review_status in ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED')),
  reason text not null check (char_length(trim(reason)) between 10 and 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.business_profile_change_requests
  add column if not exists requested_name text;

alter table public.business_profile_change_requests
  alter column requested_name drop not null,
  alter column requested_description drop not null,
  alter column requested_products_summary drop not null,
  add column if not exists change_scope text not null default 'BOTH',
  add column if not exists description_review_status text not null default 'PENDING',
  add column if not exists products_review_status text not null default 'PENDING';

create index if not exists business_profile_change_requests_business_idx
  on public.business_profile_change_requests (business_id, created_at desc);

create unique index if not exists one_pending_business_profile_change_request
  on public.business_profile_change_requests (business_id)
  where status = 'PENDING';

alter table public.business_profile_change_requests enable row level security;

drop policy if exists "Owners can request business profile changes" on public.business_profile_change_requests;
create policy "Owners can request business profile changes"
on public.business_profile_change_requests
for insert to authenticated
with check (
  status = 'PENDING'
  and reviewed_at is null
  and admin_comment is null
  and
  business_id in (
    select id from public.businesses where owner_id = auth.uid() and status::text = 'APPROVED'
  )
);

drop policy if exists "Owners can view business profile change requests" on public.business_profile_change_requests;
create policy "Owners can view business profile change requests"
on public.business_profile_change_requests
for select to authenticated
using (
  business_id in (
    select id from public.businesses where owner_id = auth.uid()
  )
);

drop policy if exists "Admins can manage business profile change requests" on public.business_profile_change_requests;
create policy "Admins can manage business profile change requests" on public.business_profile_change_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profile fields are controlled by the admin approval flow. Owners may correct
-- them while the shop is pending; after approval they must submit a request.
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
     and (old.description is distinct from new.description
       or old.products_summary is distinct from new.products_summary) then
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

-- Normalize every new owner request before RLS evaluates it. Business names
-- are intentionally excluded from this review workflow.
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

-- Apply only accepted fields in one transaction. This RPC is server-only and
-- independently verifies the administrator identity supplied by the API.
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
    'request', to_jsonb(request_row) || jsonb_build_object('status', 'APPROVED', 'reviewed_at', now()),
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
