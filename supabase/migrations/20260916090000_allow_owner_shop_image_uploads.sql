-- Allow shop owners to upload the logo and QR images used by the owner shop page.
-- These files use {business_id}/... paths, while the existing storage ownership
-- function previously covered only user-, service-, order-, and chat-scoped paths.

begin;

create or replace function public.can_manage_user_upload(upload_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folders text[] := storage.foldername(upload_path);
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  -- Verification images use {user_id}/{document_type}.
  if folders[1] = current_user_id::text then
    return true;
  end if;

  -- Shop logos and QR images use {business_id}/{filename}.
  if folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1
       from public.businesses b
       where b.id = folders[1]::uuid
         and b.owner_id = current_user_id
     ) then
    return true;
  end if;

  -- Service images use services/{business_id}/{user_id}-... .
  if folders[1] = 'services'
     and folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1 from public.businesses b
       where b.id = folders[2]::uuid and b.owner_id = current_user_id
     ) then
    return true;
  end if;

  -- Payment proofs use receipts/{customer_id}/... and design uploads use
  -- designs/{customer_id}/... .
  if folders[1] in ('receipts', 'designs') and folders[2] = current_user_id::text then
    return true;
  end if;

  -- Refund proofs use refunds/{order_id}/... and are uploaded by the owner.
  if folders[1] = 'refunds'
     and folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1
       from public.orders o
       join public.businesses b on b.id = o.business_id
       where o.id = folders[2]::uuid and b.owner_id = current_user_id
     ) then
    return true;
  end if;

  -- Chat images use {conversation_id}/{user_id}-... .
  if folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1 from public.chat_conversations c
       where c.id = folders[1]::uuid
         and (c.customer_id = current_user_id or exists (
           select 1 from public.businesses b where b.id = c.business_id and b.owner_id = current_user_id
         ))
     ) then
    return true;
  end if;

  return false;
end;
$$;

commit;
