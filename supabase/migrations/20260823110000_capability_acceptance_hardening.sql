-- Capability acceptance hardening for collaborative design proofing.
-- Customers may approve/request changes on shop proofs; only shop owners
-- may lock a final approved proof with a recorded total cost.

begin;

alter table if exists public.design_proofs
  add column if not exists locked_total_amount numeric(12, 2),
  add column if not exists locked_at timestamptz;

create or replace function public.guard_design_proof_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  conversation_customer uuid;
  business_owner uuid;
  caller_is_owner boolean := false;
  caller_is_customer boolean := false;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  select c.customer_id, b.owner_id
    into conversation_customer, business_owner
  from public.chat_conversations c
  join public.businesses b on b.id = c.business_id
  where c.id = old.conversation_id;

  caller_is_owner := business_owner = caller;
  caller_is_customer := conversation_customer = caller;
  if not caller_is_owner and not caller_is_customer then
    raise exception 'Only proof participants can review a design proof';
  end if;

  if new.conversation_id is distinct from old.conversation_id
     or new.order_id is distinct from old.order_id
     or new.version_number is distinct from old.version_number
     or new.file_url is distinct from old.file_url
     or new.file_name is distinct from old.file_name
     or new.file_size_bytes is distinct from old.file_size_bytes
     or new.file_type is distinct from old.file_type
     or new.file_format is distinct from old.file_format
     or new.uploaded_by is distinct from old.uploaded_by
     or new.uploaded_role is distinct from old.uploaded_role then
    raise exception 'Proof identity and file details cannot be changed';
  end if;

  if new.status not in ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES') then
    raise exception 'Invalid design proof status';
  end if;

  if caller_is_customer then
    if old.uploaded_by = caller then
      raise exception 'Customers cannot review their own uploaded proof';
    end if;
    if new.is_locked is distinct from old.is_locked
       or new.locked_total_amount is distinct from old.locked_total_amount
       or new.locked_at is distinct from old.locked_at then
      raise exception 'Only the business owner can lock a proof cost';
    end if;
  end if;

  if new.is_locked and new.status <> 'APPROVED' then
    raise exception 'Only an approved proof can be locked';
  end if;
  if new.is_locked and new.locked_total_amount is null then
    raise exception 'A locked proof must include a final cost';
  end if;

  if old.is_locked and (
    new.status is distinct from old.status
    or new.is_locked is distinct from old.is_locked
    or new.locked_total_amount is distinct from old.locked_total_amount
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'Locked proof versions cannot be changed';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_design_proof_updates() from public;

do $$
begin
  if to_regclass('public.design_proofs') is not null then
    execute 'drop trigger if exists guard_design_proof_updates on public.design_proofs';
    execute 'create trigger guard_design_proof_updates before update on public.design_proofs for each row execute function public.guard_design_proof_updates()';
  end if;
end;
$$;

commit;
