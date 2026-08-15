-- Atomic checkout transaction for Supabase/Vercel free-tier deployments.
-- Run after orders, services, chat quotes, and inventory migrations.

alter table if exists public.inventory_movements
  add column if not exists created_by uuid;

create or replace function public.place_order_atomic(
  p_business_id uuid,
  p_items jsonb,
  p_order jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  customer uuid := auth.uid();
  business_row public.businesses%rowtype;
  item jsonb;
  service_row public.services%rowtype;
  normalized_items jsonb := '[]'::jsonb;
  item_specs jsonb;
  item_type text;
  item_name text;
  source_message_id uuid;
  quote_amount numeric;
  unit_price numeric;
  modifier numeric;
  option_key text;
  option_value text;
  quantity integer;
  calculated_total numeric := 0;
  downpayment_percent numeric;
  downpayment numeric;
  balance numeric;
  new_order_id uuid;
begin
  if customer is null then
    raise exception 'Authentication is required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  select * into business_row
  from public.businesses
  where id = p_business_id
  for share;

  if not found or business_row.status <> 'APPROVED' then
    raise exception 'This shop is not available';
  end if;
  if business_row.is_open is false then
    raise exception 'This shop is currently closed';
  end if;

  if p_order->>'payment_method' not in ('COD', 'E-Wallet') then
    raise exception 'Invalid payment method';
  end if;
  if p_order->>'delivery_type' not in ('PICKUP', 'DELIVERY') then
    raise exception 'Invalid fulfillment type';
  end if;
  if p_order->>'fulfillment_mode' not in ('NEED_NOW', 'ADVANCE') then
    raise exception 'Invalid fulfillment mode';
  end if;

  downpayment_percent := coalesce((p_order->>'downpayment_percent')::numeric, business_row.min_downpayment_percent, 0);
  if downpayment_percent < coalesce(business_row.min_downpayment_percent, 0)
     or downpayment_percent < 0 or downpayment_percent > 100 then
    raise exception 'Invalid downpayment percentage';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if item->>'id' is null then
      raise exception 'Cart item is missing a service id';
    end if;

    quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));
    select * into service_row
    from public.services
    where id = (item->>'id')::uuid
      and business_id = p_business_id
    for update;

    if not found or service_row.available is false then
      raise exception 'A cart item is no longer available';
    end if;

    item_type := coalesce(service_row.item_type, item->>'item_type', 'service');
    item_name := service_row.name;
    item_specs := coalesce(item->'selected_specs', '{}'::jsonb);
    modifier := 0;

    if item_type <> 'product' then
      foreach option_key in array ARRAY['size', 'material', 'quality']
      loop
        option_value := item_specs->>option_key;
        if option_value is not null and service_row.specs_json ? 'price_modifiers' then
          modifier := modifier + coalesce((service_row.specs_json->'price_modifiers'->>option_value)::numeric, 0);
        end if;
      end loop;
    end if;

    -- Quoted custom work is valid only when the amount comes from a quote
    -- message sent by this shop in this customer's conversation.
    if coalesce((item->>'is_quoted_checkout')::boolean, false) then
      if item->>'source_message_id' is null then
        raise exception 'Quoted item is missing its quote reference';
      end if;
      source_message_id := (item->>'source_message_id')::uuid;
      select coalesce((cm.metadata->>'total_cost')::numeric, (cm.metadata->>'quote_amount')::numeric)
        into quote_amount
      from public.chat_messages cm
      join public.chat_conversations cc on cc.id = cm.conversation_id
      where cm.id = source_message_id
        and cm.message_type = 'quote'
        and cm.sender_role = 'BUSINESS_OWNER'
        and cc.business_id = p_business_id
        and cc.customer_id = customer;
      if quote_amount is null or quote_amount < 0 then
        raise exception 'The quote is unavailable or no longer valid';
      end if;
      unit_price := quote_amount;
    else
      unit_price := coalesce(service_row.price, 0) + modifier;
    end if;

    if unit_price < 0 then
      raise exception 'Invalid item price';
    end if;

    if item_type = 'product' then
      if coalesce(service_row.stock_qty, 0) < quantity then
        raise exception 'Insufficient stock for %', item_name;
      end if;
      update public.services
      set stock_qty = coalesce(stock_qty, 0) - quantity,
          updated_at = now()
      where id = service_row.id;

      insert into public.inventory_movements (
        business_id, service_id, qty_change, new_stock_qty, reason, note, created_by
      ) values (
        p_business_id, service_row.id, -quantity,
        coalesce(service_row.stock_qty, 0) - quantity,
        'ORDER_DEDUCTION',
        'Atomic checkout',
        customer
      );
    end if;

    calculated_total := calculated_total + (unit_price * quantity);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'id', service_row.id,
      'name', item_name,
      'item_type', item_type,
      'quantity', quantity,
      'price', unit_price,
      'selected_specs', item_specs,
      'design_url', item->'design_url',
      'design_file_name', item->'design_file_name',
      'design_file_type', item->'design_file_type',
      'design_file_size', item->'design_file_size',
      'design_files', coalesce(item->'design_files', '[]'::jsonb),
      'design_urls', coalesce(item->'design_urls', '[]'::jsonb),
      'design_version', item->'design_version',
      'is_quoted_checkout', coalesce(item->'is_quoted_checkout', 'false'::jsonb),
      'source_message_id', item->'source_message_id'
    ));
  end loop;

  downpayment := round(calculated_total * downpayment_percent / 100, 2);
  balance := calculated_total - downpayment;

  insert into public.orders (
    customer_id, business_id, total, status, payment_method, receipt_url,
    items, delivery_type, delivery_address, delivery_coordinates,
    fulfillment_mode, expected_fulfillment_at, customer_phone,
    quotation_valid_until, quotation_terms, tax_amount, discount_amount,
    downpayment_amount, balance_amount
  ) values (
    customer, p_business_id, calculated_total, 'PENDING', p_order->>'payment_method',
    nullif(p_order->>'receipt_url', ''), normalized_items,
    p_order->>'delivery_type', nullif(p_order->>'delivery_address', ''), p_order->'delivery_coordinates',
    p_order->>'fulfillment_mode', nullif(p_order->>'expected_fulfillment_at', ''),
    nullif(p_order->>'customer_phone', ''),
    now() + interval '14 days',
    'Production starts after customization approval, final proof approval, and required payment confirmation.',
    0, 0, downpayment, balance
  ) returning id into new_order_id;

  return new_order_id;
end;
$$;

revoke all on function public.place_order_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.place_order_atomic(uuid, jsonb, jsonb) to authenticated, service_role;
