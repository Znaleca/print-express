-- Controlled business profile changes
-- Run this after add-business-profile-fields.sql.

create table if not exists public.business_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_description text not null check (char_length(trim(requested_description)) between 20 and 800),
  requested_products_summary text not null check (char_length(trim(requested_products_summary)) between 10 and 500),
  reason text not null check (char_length(trim(reason)) between 10 and 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

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
  business_id in (
    select id from public.businesses where owner_id = auth.uid()
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

-- Profile summary fields are controlled by the admin approval flow.
-- Owners can still update normal storefront fields such as contact details and location.
create or replace function public.prevent_owner_business_summary_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.description is distinct from new.description
      or old.products_summary is distinct from new.products_summary)
     and not public.is_admin() then
    raise exception 'Business background and products summary can only be changed after admin approval.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_owner_business_summary_edit_trigger on public.businesses;
create trigger prevent_owner_business_summary_edit_trigger
before update on public.businesses
for each row execute function public.prevent_owner_business_summary_edit();
