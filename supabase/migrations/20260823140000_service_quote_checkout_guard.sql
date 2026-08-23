-- Custom services must be discussed and formally quoted before checkout.
-- Products keep their normal direct-cart checkout flow.

begin;

create or replace function public.enforce_service_quote_checkout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  service_kind text;
  source_quote_id uuid;
  quoted_total numeric;
  quote_expiry timestamptz;
  quote_ordered boolean;
begin
  if jsonb_typeof(new.items) <> 'array' then
    raise exception 'Order items must be an array';
  end if;

  for item in select value from jsonb_array_elements(new.items)
  loop
    select coalesce(s.item_type, 'service')
      into service_kind
    from public.services s
    where s.id = (item->>'id')::uuid
      and s.business_id = new.business_id;

    if service_kind is null then
      raise exception 'A selected catalog item is unavailable';
    end if;

    if service_kind <> 'product' then
      if not coalesce((item->>'is_quoted_checkout')::boolean, false)
         or nullif(item->>'source_message_id', '') is null then
        raise exception 'Custom services require a formal seller quotation before checkout';
      end if;

      source_quote_id := (item->>'source_message_id')::uuid;
      select
        coalesce((cm.metadata->>'total_cost')::numeric, (cm.metadata->>'quote_amount')::numeric),
        nullif(cm.metadata->>'valid_until', '')::timestamptz,
        coalesce((cm.metadata->>'ordered')::boolean, false)
        into quoted_total, quote_expiry, quote_ordered
      from public.chat_messages cm
      join public.chat_conversations cc on cc.id = cm.conversation_id
      where cm.id = source_quote_id
        and cm.message_type = 'quote'
        and cm.sender_role = 'BUSINESS_OWNER'
        and cm.metadata->>'service_id' = item->>'id'
        and cc.business_id = new.business_id
        and cc.customer_id = new.customer_id
      for update of cm;

      if quoted_total is null
         or quoted_total < 0
         or quoted_total is distinct from (item->>'price')::numeric
         or quote_ordered
         or coalesce((item->>'quantity')::integer, 1) <> 1
         or (quote_expiry is not null and quote_expiry < now()) then
        raise exception 'The service quotation is unavailable, mismatched, or expired';
      end if;

      update public.chat_messages
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'ordered', true,
        'orderId', new.id
      )
      where id = source_quote_id;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists enforce_service_quote_checkout on public.orders;
create trigger enforce_service_quote_checkout
before insert or update of items, business_id, customer_id
on public.orders
for each row
execute function public.enforce_service_quote_checkout();

commit;
