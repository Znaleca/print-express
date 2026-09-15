-- Admin verification updates use the server-side service-role client.
-- The profile-field trigger must allow that trusted path while continuing to
-- block direct owner edits after approval.

begin;

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

  return new;
end;
$$;

commit;
