-- Press & Present meaningful shop-owner activity tracking.
-- Customer reads and customer checkout activity never update last_activity_at.

begin;

create or replace function public.touch_business_activity(
  p_business_id uuid,
  p_activity_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or p_business_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.owner_id = actor_id
      and b.lifecycle_state = 'ACTIVE'
  ) then
    perform set_config('app.business_system_write', 'true', true);

    update public.businesses
    set last_activity_at = now()
    where id = p_business_id;
  end if;
end;
$$;

revoke all on function public.touch_business_activity(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.record_owner_sign_in(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'BUSINESS_OWNER'
  ) then
    raise exception 'Business owner account required';
  end if;

  perform set_config('app.business_system_write', 'true', true);

  update public.businesses
  set last_activity_at = now()
  where owner_id = p_user_id
    and lifecycle_state = 'ACTIVE';

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.record_owner_sign_in(uuid)
  from public, anon, authenticated;
grant execute on function public.record_owner_sign_in(uuid) to service_role;

create or replace function public.touch_business_activity_from_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_id uuid := coalesce(new.id, old.id);
  old_public jsonb;
  new_public jsonb;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  old_public := to_jsonb(old) - array[
    'last_activity_at', 'updated_at', 'locked_at', 'locked_by',
    'lock_reason', 'archived_at', 'archived_by'
  ];
  new_public := to_jsonb(new) - array[
    'last_activity_at', 'updated_at', 'locked_at', 'locked_by',
    'lock_reason', 'archived_at', 'archived_by'
  ];

  if old_public is distinct from new_public then
    perform public.touch_business_activity(business_id, 'SHOP_INFORMATION_UPDATED');
  end if;

  return new;
end;
$$;

drop trigger if exists touch_business_activity_from_business on public.businesses;
create trigger touch_business_activity_from_business
after update on public.businesses
for each row execute function public.touch_business_activity_from_business();

create or replace function public.touch_business_activity_from_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.touch_business_activity(
    coalesce(new.business_id, old.business_id),
    case when tg_op = 'INSERT' then 'CATALOG_ITEM_CREATED' else 'CATALOG_ITEM_UPDATED' end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_business_activity_from_service on public.services;
create trigger touch_business_activity_from_service
after insert or update or delete on public.services
for each row execute function public.touch_business_activity_from_service();

create or replace function public.touch_business_activity_from_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.reason, '') <> 'ORDER_DEDUCTION' then
    perform public.touch_business_activity(new.business_id, 'STOCK_UPDATED');
  end if;
  return new;
end;
$$;

drop trigger if exists touch_business_activity_from_inventory on public.inventory_movements;
create trigger touch_business_activity_from_inventory
after insert on public.inventory_movements
for each row execute function public.touch_business_activity_from_inventory();

create or replace function public.touch_business_activity_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    perform public.touch_business_activity(new.business_id, 'ORDER_UPDATED');
  end if;
  return new;
end;
$$;

drop trigger if exists touch_business_activity_from_order on public.orders;
create trigger touch_business_activity_from_order
after update of status on public.orders
for each row execute function public.touch_business_activity_from_order();

create or replace function public.touch_business_activity_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_id uuid;
begin
  if new.sender_role <> 'BUSINESS_OWNER' then
    return new;
  end if;

  select c.business_id into business_id
  from public.chat_conversations c
  where c.id = new.conversation_id;

  perform public.touch_business_activity(business_id, 'CUSTOMER_REPLY');
  return new;
end;
$$;

drop trigger if exists touch_business_activity_from_message on public.chat_messages;
create trigger touch_business_activity_from_message
after insert on public.chat_messages
for each row execute function public.touch_business_activity_from_message();

create or replace function public.touch_business_activity_from_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.touch_business_activity(new.business_id, 'DOCUMENT_UPLOADED');
  return new;
end;
$$;

drop trigger if exists touch_business_activity_from_document on public.business_documents;
create trigger touch_business_activity_from_document
after insert or update on public.business_documents
for each row execute function public.touch_business_activity_from_document();

create or replace function public.touch_business_activity_from_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.touch_business_activity(
    coalesce(new.business_id, old.business_id),
    'OPERATING_HOURS_UPDATED'
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_business_activity_from_hours on public.business_hours;
create trigger touch_business_activity_from_hours
after insert or update or delete on public.business_hours
for each row execute function public.touch_business_activity_from_hours();

commit;
