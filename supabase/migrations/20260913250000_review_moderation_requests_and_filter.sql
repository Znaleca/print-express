-- Review moderation requests, private Admin-managed word filtering, and
-- target-aware public rating projections.
begin;

alter table public.orders
  add column if not exists review_service_id uuid references public.services(id) on delete set null,
  add column if not exists feedback_masked text;

-- The original review remains available to protected Admin/server queries only.
-- Customer and owner UI reads use feedback_masked or the owner Reviews API.
revoke select (feedback) on public.orders from anon, authenticated;
grant select (feedback_masked) on public.orders to anon, authenticated;

create table if not exists public.review_moderation_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 5 and 1000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_response text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists review_moderation_requests_one_pending_idx
  on public.review_moderation_requests(order_id)
  where status = 'PENDING';
create index if not exists review_moderation_requests_business_status_idx
  on public.review_moderation_requests(business_id, status, created_at desc);

create table if not exists public.review_moderation_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.review_moderation_requests(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  action text not null check (action in ('REQUESTED', 'APPROVED', 'REJECTED', 'HIDDEN', 'RESTORED')),
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists review_moderation_history_order_idx
  on public.review_moderation_history(order_id, created_at desc);

create table if not exists public.review_offensive_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique check (char_length(trim(word)) between 2 and 80),
  replacement text not null default '****' check (replacement = '****'),
  match_whole_word boolean not null default true,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_offensive_words_enabled_idx
  on public.review_offensive_words(is_enabled, word);

-- The private filter list is never sent to public clients. This function is
-- used only by protected triggers to materialize a safe public copy.
create or replace function public.mask_review_text(input_text text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  masked text := coalesce(input_text, '');
  rule_row record;
  search_from integer;
  match_offset integer;
  match_position integer;
  word_length integer;
  replacement_text text;
  after_position integer;
  before_char text;
  after_char text;
  boundaries_match boolean;
begin
  for rule_row in
    select trim(word) as word, replacement, match_whole_word
    from public.review_offensive_words
    where is_enabled = true
    order by char_length(trim(word)) desc, id
  loop
    word_length := char_length(rule_row.word);
    replacement_text := coalesce(rule_row.replacement, '****');
    search_from := 1;

    loop
      match_offset := strpos(lower(substr(masked, search_from)), lower(rule_row.word));
      exit when match_offset = 0;
      match_position := search_from + match_offset - 1;
      after_position := match_position + word_length;
      before_char := case when match_position = 1 then '' else substr(masked, match_position - 1, 1) end;
      after_char := case when after_position > char_length(masked) then '' else substr(masked, after_position, 1) end;
      boundaries_match := rule_row.match_whole_word = false
        or ((before_char = '' or before_char !~ '[[:alnum:]_]')
          and (after_char = '' or after_char !~ '[[:alnum:]_]'));

      if boundaries_match then
        masked := overlay(masked placing replacement_text from match_position for word_length);
        search_from := match_position + char_length(replacement_text);
      else
        search_from := match_position + word_length;
      end if;
    end loop;
  end loop;

  return masked;
end;
$$;

revoke all on function public.mask_review_text(text) from public, anon, authenticated;

-- Keep the original review in orders for authorized Admin moderation while
-- maintaining a masked projection for every non-Admin surface.
create or replace function public.project_review_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.review_service_id is not null then
    if not exists (
      select 1
      from public.services s
      where s.id = new.review_service_id
        and s.business_id = new.business_id
    ) then
      raise exception 'The selected review item does not belong to this shop';
    end if;

    if jsonb_typeof(coalesce(new.items, '[]'::jsonb)) <> 'array'
       or not exists (
         select 1
         from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) item
         where item->>'id' = new.review_service_id::text
       ) then
      raise exception 'The selected review item was not part of this order';
    end if;
  end if;

  new.feedback_masked := public.mask_review_text(new.feedback);
  return new;
end;
$$;

revoke all on function public.project_review_text() from public, anon, authenticated;
drop trigger if exists project_review_text on public.orders;
create trigger project_review_text
before insert or update of business_id, items, rating, feedback, review_service_id
on public.orders
for each row execute function public.project_review_text();

-- Owners can request moderation but cannot directly change visibility.
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
      'refund_proof_url', 'refund_receipt_url', 'fully_paid'
    ];
    protected_new := to_jsonb(new) - array[
      'status', 'status_history', 'updated_at',
      'cancel_reason', 'cancelled_at',
      'refund_reason', 'refund_requested_at', 'refunded_at',
      'refund_proof_url', 'refund_receipt_url', 'fully_paid'
    ];

    if protected_old is distinct from protected_new then
      raise exception 'Owners cannot change review or protected order fields';
    end if;
  end if;

  return new;
end;
$$;

-- Extend the safe read model with a real service/product association.
alter table public.visible_business_reviews_data
  add column if not exists review_service_id uuid,
  add column if not exists review_target_name text,
  add column if not exists review_target_type text;

create or replace function public.sync_visible_business_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_customer_name text;
  review_item_name text;
  review_item_type text;
begin
  if tg_op = 'DELETE' then
    delete from public.visible_business_reviews_data where order_id = old.id;
    return old;
  end if;

  if new.status in ('COMPLETED', 'DELIVERY_COMPLETED')
     and new.rating is not null
     and not coalesce(new.feedback_hidden, false) then
    select p.full_name into review_customer_name
    from public.profiles p where p.id = new.customer_id;

    select s.name, s.item_type
    into review_item_name, review_item_type
    from public.services s
    where s.id = new.review_service_id;

    insert into public.visible_business_reviews_data (
      order_id, business_id, rating, feedback, created_at, customer_name,
      item_name, review_service_id, review_target_name, review_target_type
    ) values (
      new.id, new.business_id, new.rating, coalesce(new.feedback_masked, public.mask_review_text(new.feedback)),
      new.created_at, review_customer_name, review_item_name,
      new.review_service_id, review_item_name, review_item_type
    )
    on conflict (order_id) do update set
      business_id = excluded.business_id,
      rating = excluded.rating,
      feedback = excluded.feedback,
      created_at = excluded.created_at,
      customer_name = excluded.customer_name,
      item_name = excluded.item_name,
      review_service_id = excluded.review_service_id,
      review_target_name = excluded.review_target_name,
      review_target_type = excluded.review_target_type;
  else
    delete from public.visible_business_reviews_data where order_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_visible_business_review() from public, anon, authenticated;
drop trigger if exists sync_visible_business_review on public.orders;
create trigger sync_visible_business_review
after insert or update of business_id, customer_id, status, rating, feedback,
  feedback_hidden, items, created_at, review_service_id, feedback_masked
on public.orders
for each row execute function public.sync_visible_business_review();

-- Rebuild projections after an Admin changes the private filter list.
create or replace function public.refresh_review_masks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set feedback_masked = public.mask_review_text(feedback)
  where rating is not null
    and status in ('COMPLETED', 'DELIVERY_COMPLETED');

  update public.visible_business_reviews_data data
  set feedback = public.mask_review_text(orders.feedback)
  from public.orders
  where orders.id = data.order_id;
  return null;
end;
$$;

revoke all on function public.refresh_review_masks() from public, anon, authenticated;
drop trigger if exists refresh_review_masks on public.review_offensive_words;
create trigger refresh_review_masks
after insert or update or delete on public.review_offensive_words
for each statement execute function public.refresh_review_masks();

update public.orders
set feedback_masked = public.mask_review_text(feedback)
where rating is not null
  and status in ('COMPLETED', 'DELIVERY_COMPLETED');

update public.visible_business_reviews_data data
set feedback = public.mask_review_text(orders.feedback),
    item_name = services.name,
    review_service_id = orders.review_service_id,
    review_target_name = services.name,
    review_target_type = services.item_type
from public.orders
left join public.services on services.id = orders.review_service_id
where orders.id = data.order_id;

drop view if exists public.visible_business_reviews;
drop view if exists public.business_reviews;

create view public.business_reviews
with (security_invoker = true)
as
select
  o.id as order_id,
  o.business_id,
  o.customer_id,
  o.rating,
  o.feedback,
  coalesce(o.feedback_hidden, false) as feedback_hidden,
  o.feedback_hidden_at,
  o.feedback_hidden_by,
  o.created_at,
  p.full_name as customer_name,
  s.name as item_name,
  o.review_service_id
from public.orders o
left join public.profiles p on p.id = o.customer_id
left join public.services s on s.id = o.review_service_id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null;

create view public.visible_business_reviews
with (security_invoker = true)
as
select
  order_id,
  business_id,
  rating,
  feedback,
  created_at,
  customer_name,
  item_name,
  review_service_id,
  review_target_name,
  review_target_type
from public.visible_business_reviews_data;

revoke all on public.business_reviews from public, anon, authenticated;
grant select on public.business_reviews to service_role;
revoke all on public.visible_business_reviews from public, anon, authenticated;
grant select on public.visible_business_reviews to anon, authenticated;

-- Owner request and Admin moderation RPCs keep authorization server-side.
create or replace function public.request_review_removal(
  p_order_id uuid,
  p_reason text,
  p_requester_id uuid default null
)
returns public.review_moderation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  order_row public.orders%rowtype;
  request_row public.review_moderation_requests;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from caller then
    raise exception 'Requester identity mismatch';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required'; end if;

  select o.* into order_row
  from public.orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id and b.owner_id = caller
  for update of o;
  if not found then raise exception 'Review not found'; end if;
  if order_row.status not in ('COMPLETED', 'DELIVERY_COMPLETED') or order_row.rating is null then
    raise exception 'Only completed reviews can be reported';
  end if;
  if exists (select 1 from public.review_moderation_requests r where r.order_id = p_order_id and r.status = 'PENDING') then
    raise exception 'A pending removal request already exists for this review';
  end if;

  insert into public.review_moderation_requests (order_id, business_id, owner_id, reason)
  values (order_row.id, order_row.business_id, caller, trim(p_reason))
  returning * into request_row;

  insert into public.review_moderation_history (request_id, order_id, business_id, action, note, actor_id)
  values (request_row.id, request_row.order_id, request_row.business_id, 'REQUESTED', request_row.reason, caller);
  return request_row;
end;
$$;

create or replace function public.moderate_review_removal(
  p_request_id uuid,
  p_status text,
  p_response text default null,
  p_requester_id uuid default null
)
returns public.review_moderation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  request_row public.review_moderation_requests;
  next_status text := upper(trim(coalesce(p_status, '')));
begin
  if caller is null then raise exception 'Admin access required'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from caller then
    raise exception 'Requester identity mismatch';
  end if;
  if not exists (select 1 from public.profiles where id = caller and role = 'ADMIN') then
    raise exception 'Admin access required';
  end if;
  if next_status not in ('APPROVED', 'REJECTED') then raise exception 'Invalid moderation status'; end if;

  select * into request_row
  from public.review_moderation_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Moderation request not found'; end if;
  if request_row.status <> 'PENDING' then raise exception 'This request has already been reviewed'; end if;

  if next_status = 'APPROVED' then
    update public.orders
    set feedback_hidden = true,
        feedback_hidden_at = now(),
        feedback_hidden_by = 'admin'
    where id = request_row.order_id;
  end if;

  update public.review_moderation_requests
  set status = next_status,
      admin_response = nullif(trim(coalesce(p_response, '')), ''),
      reviewed_by = caller,
      reviewed_at = now(),
      updated_at = now()
  where id = request_row.id
  returning * into request_row;

  insert into public.review_moderation_history (request_id, order_id, business_id, action, note, actor_id)
  values (request_row.id, request_row.order_id, request_row.business_id, next_status, request_row.admin_response, caller);
  return request_row;
end;
$$;

revoke all on function public.request_review_removal(uuid, text, uuid) from public, anon;
grant execute on function public.request_review_removal(uuid, text, uuid) to authenticated;

create or replace function public.set_admin_review_visibility(
  p_order_id uuid,
  p_hidden boolean,
  p_note text default null,
  p_requester_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  order_row public.orders;
begin
  if caller is null then
    raise exception 'Admin access required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from caller then
    raise exception 'Requester identity mismatch';
  end if;
  if not exists (select 1 from public.profiles where id = caller and role = 'ADMIN') then
    raise exception 'Admin access required';
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
    and o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
    and o.rating is not null
  for update;
  if not found then raise exception 'Review not found'; end if;

  update public.orders
  set feedback_hidden = p_hidden,
      feedback_hidden_at = case when p_hidden then now() else null end,
      feedback_hidden_by = case when p_hidden then 'admin' else null end
  where id = p_order_id;

  insert into public.review_moderation_history (
    order_id, business_id, action, note, actor_id
  ) values (
    p_order_id,
    order_row.business_id,
    case when p_hidden then 'HIDDEN' else 'RESTORED' end,
    nullif(trim(coalesce(p_note, '')), ''),
    caller
  );

  select o.* into order_row from public.orders o where o.id = p_order_id;
  return order_row;
end;
$$;

revoke all on function public.set_admin_review_visibility(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.set_admin_review_visibility(uuid, boolean, text, uuid) to authenticated;

revoke all on function public.moderate_review_removal(uuid, text, text, uuid) from public, anon;
grant execute on function public.moderate_review_removal(uuid, text, text, uuid) to authenticated;

alter table public.review_moderation_requests enable row level security;
alter table public.review_moderation_history enable row level security;
alter table public.review_offensive_words enable row level security;

revoke all on public.review_moderation_requests from public, anon, authenticated;
grant select on public.review_moderation_requests to authenticated;
create policy "Owners and admins can view review removal requests"
on public.review_moderation_requests for select to authenticated
using (owner_id = auth.uid() or public.is_admin());

revoke all on public.review_moderation_history from public, anon, authenticated;
grant select on public.review_moderation_history to authenticated;
create policy "Admins can view review moderation history"
on public.review_moderation_history for select to authenticated
using (public.is_admin());

revoke all on public.review_offensive_words from public, anon, authenticated;
grant select, insert, update, delete on public.review_offensive_words to authenticated;
create policy "Admins can manage review offensive words"
on public.review_offensive_words for all to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
