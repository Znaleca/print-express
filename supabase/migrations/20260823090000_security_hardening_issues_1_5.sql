-- Security hardening for audit Issues 1-5.
-- Apply after the existing Press & Present schema migrations.

begin;

-- -------------------------------------------------------------------------
-- Issue 1: private storage for customer designs, payment/refund proofs,
-- verification documents, and chat attachments.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('private-assets', 'private-assets', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

update storage.buckets
set public = false
where id in ('business-documents', 'chat-images');

create or replace function public.can_manage_protected_upload(
  p_bucket_id text,
  p_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folders text[] := storage.foldername(p_path);
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  if public.is_admin() then
    return true;
  end if;

  if p_bucket_id = 'private-assets' then
    if folders[1] in ('designs', 'receipts', 'documents')
       and folders[2] = current_user_id::text then
      return true;
    end if;

    if folders[1] = 'refunds'
       and folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       and exists (
         select 1
         from public.orders o
         join public.businesses b on b.id = o.business_id
         where o.id = folders[2]::uuid
           and b.owner_id = current_user_id
       ) then
      return true;
    end if;
  end if;

  if p_bucket_id = 'chat-images'
     and folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1
       from public.chat_conversations c
       where c.id = folders[1]::uuid
         and (
           c.customer_id = current_user_id
           or exists (
             select 1 from public.businesses b
             where b.id = c.business_id and b.owner_id = current_user_id
           )
         )
     ) then
    return true;
  end if;

  -- Legacy business-document paths are accepted only when the first folder
  -- belongs to the authenticated owner. New uploads use private-assets.
  if p_bucket_id = 'business-documents'
     and (
       folders[1] = current_user_id::text
       or (
         folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         and exists (
           select 1 from public.businesses b
           where b.id = folders[1]::uuid and b.owner_id = current_user_id
         )
       )
     ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.can_view_protected_upload(
  p_bucket_id text,
  p_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folders text[] := storage.foldername(p_path);
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  if public.is_admin() then
    return true;
  end if;

  if p_bucket_id = 'private-assets' then
    if folders[1] in ('designs', 'receipts', 'documents')
       and folders[2] = current_user_id::text then
      return true;
    end if;

    if folders[1] = 'refunds'
       and folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       and exists (
         select 1
         from public.orders o
         left join public.businesses b on b.id = o.business_id
         where o.id = folders[2]::uuid
           and (o.customer_id = current_user_id or b.owner_id = current_user_id)
       ) then
      return true;
    end if;

    if exists (
      select 1
      from public.orders o
      left join public.businesses b on b.id = o.business_id
      where (
        position(p_path in coalesce(o.receipt_url, '')) > 0
        or position(p_path in coalesce(o.refund_proof_url, '')) > 0
        or position(p_path in coalesce(o.refund_receipt_url, '')) > 0
        or position(p_path in coalesce(o.items::text, '')) > 0
      )
      and (o.customer_id = current_user_id or b.owner_id = current_user_id)
    ) then
      return true;
    end if;
  end if;

  if p_bucket_id = 'chat-images'
     and folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists (
       select 1
       from public.chat_conversations c
       where c.id = folders[1]::uuid
         and (
           c.customer_id = current_user_id
           or exists (
             select 1 from public.businesses b
             where b.id = c.business_id and b.owner_id = current_user_id
           )
         )
     ) then
    return true;
  end if;

  if p_bucket_id = 'business-documents'
     and exists (
       select 1
       from public.business_documents d
       join public.businesses b on b.id = d.business_id
       where position(p_path in coalesce(d.file_url, '')) > 0
         and (b.owner_id = current_user_id)
     ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_manage_protected_upload(text, text) from public, anon;
revoke all on function public.can_view_protected_upload(text, text) from public, anon;
grant execute on function public.can_manage_protected_upload(text, text) to authenticated, service_role;
grant execute on function public.can_view_protected_upload(text, text) to authenticated, service_role;

drop policy if exists "Authenticated users can upload business documents" on storage.objects;
drop policy if exists "Anyone authenticated can read business documents" on storage.objects;
drop policy if exists "Owners can update their business documents" on storage.objects;
drop policy if exists "Owners can upload business documents" on storage.objects;
drop policy if exists "Owners can update business documents" on storage.objects;
drop policy if exists "Business documents are visible to authorized users" on storage.objects;
drop policy if exists "Authorized users can upload business documents" on storage.objects;
drop policy if exists "Authorized users can update business documents" on storage.objects;
drop policy if exists "Authorized users can delete business documents" on storage.objects;

create policy "Authorized users can view business documents"
on storage.objects for select to authenticated
using (bucket_id = 'business-documents' and public.can_view_protected_upload(bucket_id, name));

create policy "Authorized users can upload business documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'business-documents' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized users can update business documents"
on storage.objects for update to authenticated
using (bucket_id = 'business-documents' and public.can_manage_protected_upload(bucket_id, name))
with check (bucket_id = 'business-documents' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized users can delete business documents"
on storage.objects for delete to authenticated
using (bucket_id = 'business-documents' and public.can_manage_protected_upload(bucket_id, name));

drop policy if exists "Authenticated can upload chat images" on storage.objects;
drop policy if exists "Authenticated can read chat images" on storage.objects;
drop policy if exists "Authenticated can update chat images" on storage.objects;
drop policy if exists "Authenticated can delete chat images" on storage.objects;
drop policy if exists "Participants can upload chat images" on storage.objects;
drop policy if exists "Participants can update chat images" on storage.objects;
drop policy if exists "Participants can delete chat images" on storage.objects;
drop policy if exists "Authorized participants can view chat images" on storage.objects;
drop policy if exists "Authorized participants can upload chat images" on storage.objects;
drop policy if exists "Authorized participants can update chat images" on storage.objects;
drop policy if exists "Authorized participants can delete chat images" on storage.objects;

create policy "Authorized participants can view chat images"
on storage.objects for select to authenticated
using (bucket_id = 'chat-images' and public.can_view_protected_upload(bucket_id, name));

create policy "Authorized participants can upload chat images"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-images' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized participants can update chat images"
on storage.objects for update to authenticated
using (bucket_id = 'chat-images' and public.can_manage_protected_upload(bucket_id, name))
with check (bucket_id = 'chat-images' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized participants can delete chat images"
on storage.objects for delete to authenticated
using (bucket_id = 'chat-images' and public.can_manage_protected_upload(bucket_id, name));

drop policy if exists "Private assets are visible to authorized users" on storage.objects;
drop policy if exists "Authorized users can upload private assets" on storage.objects;
drop policy if exists "Authorized users can update private assets" on storage.objects;
drop policy if exists "Authorized users can delete private assets" on storage.objects;

create policy "Private assets are visible to authorized users"
on storage.objects for select to authenticated
using (bucket_id = 'private-assets' and public.can_view_protected_upload(bucket_id, name));

create policy "Authorized users can upload private assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'private-assets' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized users can update private assets"
on storage.objects for update to authenticated
using (bucket_id = 'private-assets' and public.can_manage_protected_upload(bucket_id, name))
with check (bucket_id = 'private-assets' and public.can_manage_protected_upload(bucket_id, name));

create policy "Authorized users can delete private assets"
on storage.objects for delete to authenticated
using (bucket_id = 'private-assets' and public.can_manage_protected_upload(bucket_id, name));

-- -------------------------------------------------------------------------
-- Issue 2: shop owners may update order status fields, but not order money,
-- customer, item, payment, delivery, or review data.
-- -------------------------------------------------------------------------
drop policy if exists "Owners can update their bound orders" on public.orders;
create policy "Owners can update their bound orders"
on public.orders for update to authenticated
using (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
)
with check (
  public.is_admin()
  or business_id in (select id from public.businesses where owner_id = auth.uid())
);

create or replace function public.prevent_owner_order_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  protected_old jsonb;
  protected_new jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from public.businesses b
    where b.id = old.business_id and b.owner_id = caller
  ) then
    protected_old := to_jsonb(old) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'fully_paid', 'rating', 'feedback'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url',
      'fully_paid', 'rating', 'feedback'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Owners cannot change protected order fields';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_owner_order_tampering() from public;

drop trigger if exists prevent_owner_order_tampering on public.orders;
create trigger prevent_owner_order_tampering
before update on public.orders
for each row execute function public.prevent_owner_order_tampering();

-- -------------------------------------------------------------------------
-- Issue 3: participants can mark messages read and use the existing proof
-- review flows, but cannot rewrite message identity or attachments.
-- -------------------------------------------------------------------------
drop policy if exists "Participants can update messages" on public.chat_messages;
create policy "Participants can update messages"
on public.chat_messages for update to authenticated
using (
  conversation_id in (
    select id from public.chat_conversations
    where customer_id = auth.uid()
       or business_id in (select id from public.businesses where owner_id = auth.uid())
  )
)
with check (
  conversation_id in (
    select id from public.chat_conversations
    where customer_id = auth.uid()
       or business_id in (select id from public.businesses where owner_id = auth.uid())
  )
);

create or replace function public.guard_chat_message_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_is_owner boolean;
  metadata_old jsonb;
  metadata_new jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  caller_is_owner := exists (
    select 1
    from public.chat_conversations c
    join public.businesses b on b.id = c.business_id
    where c.id = old.conversation_id and b.owner_id = caller
  );

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.sender_role is distinct from old.sender_role
     or new.created_at is distinct from old.created_at
     or new.image_url is distinct from old.image_url then
    raise exception 'Message identity and attachments cannot be changed';
  end if;

  if caller <> old.sender_id then
    if new.content is distinct from old.content
       or new.edited_at is distinct from old.edited_at then
      raise exception 'Only the message sender can edit message text';
    end if;
  end if;

  if new.message_type is distinct from old.message_type
     and not (
       caller_is_owner
       and old.image_url is not null
       and (
         (old.message_type = 'text' and new.message_type = 'design_version')
         or (old.message_type = 'design_version' and new.message_type = 'text')
       )
     ) then
    raise exception 'Message type cannot be changed';
  end if;

  -- These keys are the only metadata used by the existing read/proof/quote
  -- review flows. Quote totals and attachment metadata remain immutable.
  metadata_old := coalesce(old.metadata, '{}'::jsonb) - array[
    'proof_status', 'reviewed_at', 'reviewed_by', 'is_locked',
    'locked_total_amount', 'version', 'ordered', 'orderId'
  ];
  metadata_new := coalesce(new.metadata, '{}'::jsonb) - array[
    'proof_status', 'reviewed_at', 'reviewed_by', 'is_locked',
    'locked_total_amount', 'version', 'ordered', 'orderId'
  ];
  if metadata_old is distinct from metadata_new then
    raise exception 'Message metadata cannot be changed';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_chat_message_updates() from public;
drop trigger if exists guard_chat_message_updates on public.chat_messages;
create trigger guard_chat_message_updates
before update on public.chat_messages
for each row execute function public.guard_chat_message_updates();

-- -------------------------------------------------------------------------
-- Issue 4: admin approval is a single server-only transaction tied to the
-- business owner stored in the database, not to client-supplied owner_id.
-- -------------------------------------------------------------------------
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
  new_status text;
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

  new_status := case when p_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end;
  update public.businesses
  set status = new_status
  where id = p_business_id;

  if p_action = 'APPROVE' then
    update public.profiles
    set role = 'BUSINESS_OWNER', updated_at = now()
    where id = target_owner;
  end if;

  return jsonb_build_object(
    'business_id', p_business_id,
    'owner_id', target_owner,
    'status', new_status
  );
end;
$$;

revoke all on function public.admin_set_business_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_business_status(uuid, text, uuid) to service_role;

-- -------------------------------------------------------------------------
-- Issue 5: server-side checkout invariants for delivery addresses and proof
-- references. The client is still responsible for the upload UX.
-- -------------------------------------------------------------------------
create or replace function public.validate_order_checkout_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.delivery_type = 'DELIVERY'
     and nullif(trim(new.delivery_address), '') is null then
    raise exception 'A delivery address is required for delivery orders';
  end if;

  if coalesce(new.downpayment_amount, 0) > 0
     and nullif(trim(new.receipt_url), '') is null then
    raise exception 'Payment proof is required for orders with a downpayment';
  end if;

  if nullif(trim(new.receipt_url), '') is not null
     and new.receipt_url !~ ('^private-assets:receipts/' || new.customer_id::text || '/') then
    raise exception 'Invalid payment proof reference';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_order_checkout_data on public.orders;
create trigger validate_order_checkout_data
before insert on public.orders
for each row execute function public.validate_order_checkout_data();

commit;
