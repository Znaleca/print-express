-- Remove the view-owner RLS boundary from the public review feed.
--
-- The original visible_business_reviews view selected from the private
-- business_reviews view. Because ordinary views run with the view owner's
-- permissions by default, public review reads could bypass the querying
-- user's RLS context. An invoker view over a sanitized read model keeps the
-- public contract while ensuring the final read is governed by caller RLS.

begin;

-- Keep the internal moderation/server DTO explicit about its security mode as
-- well. It remains service_role-only below and is not used by public clients.
alter view public.business_reviews
  set (security_invoker = true);

create table if not exists public.visible_business_reviews_data (
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text,
  created_at timestamptz not null,
  customer_name text,
  item_name text
);

comment on table public.visible_business_reviews_data is
  'Sanitized, public-safe review read model. Rows are maintained by protected triggers; use visible_business_reviews for reads.';

create index if not exists visible_business_reviews_data_business_idx
  on public.visible_business_reviews_data (business_id, created_at desc);

-- This table contains only the columns intended for the public review feed.
-- It is read-only to application roles and still uses RLS to hide reviews for
-- shops that are not currently customer-visible.
alter table public.visible_business_reviews_data enable row level security;

revoke all on table public.visible_business_reviews_data
  from public, anon, authenticated;
grant select on table public.visible_business_reviews_data
  to anon, authenticated;

drop policy if exists "Public can view visible business reviews"
  on public.visible_business_reviews_data;
create policy "Public can view visible business reviews"
on public.visible_business_reviews_data
for select
to anon, authenticated
using (public.is_business_customer_visible(business_id));

-- Rebuild one sanitized row from the canonical order row. The function is
-- trigger-only: callers cannot invoke it directly or write the read model.
create or replace function public.sync_visible_business_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_customer_name text;
  review_item_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.visible_business_reviews_data
    where order_id = old.id;
    return old;
  end if;

  if new.status in ('COMPLETED', 'DELIVERY_COMPLETED')
     and new.rating is not null
     and not coalesce(new.feedback_hidden, false) then
    select p.full_name
    into review_customer_name
    from public.profiles p
    where p.id = new.customer_id;

    review_item_name := case
      when jsonb_typeof(coalesce(new.items, '[]'::jsonb)) = 'array'
           and jsonb_array_length(coalesce(new.items, '[]'::jsonb)) > 0
        then (new.items -> 0 ->> 'name')
      else null
    end;

    insert into public.visible_business_reviews_data (
      order_id,
      business_id,
      rating,
      feedback,
      created_at,
      customer_name,
      item_name
    ) values (
      new.id,
      new.business_id,
      new.rating,
      new.feedback,
      new.created_at,
      review_customer_name,
      review_item_name
    )
    on conflict (order_id) do update set
      business_id = excluded.business_id,
      rating = excluded.rating,
      feedback = excluded.feedback,
      created_at = excluded.created_at,
      customer_name = excluded.customer_name,
      item_name = excluded.item_name;
  else
    delete from public.visible_business_reviews_data
    where order_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_visible_business_review()
  from public, anon, authenticated;

drop trigger if exists sync_visible_business_review on public.orders;
create trigger sync_visible_business_review
after insert or update of
  business_id,
  customer_id,
  status,
  rating,
  feedback,
  feedback_hidden,
  items,
  created_at
on public.orders
for each row
execute function public.sync_visible_business_review();

-- Customer name is denormalized into the safe read model so the public view
-- does not need to traverse profiles under a definer-owned view.
create or replace function public.sync_visible_business_review_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.visible_business_reviews_data
  set customer_name = new.full_name
  where order_id in (
    select o.id
    from public.orders o
    where o.customer_id = new.id
  );

  return new;
end;
$$;

revoke all on function public.sync_visible_business_review_customer()
  from public, anon, authenticated;

drop trigger if exists sync_visible_business_review_customer on public.profiles;
create trigger sync_visible_business_review_customer
after update of full_name on public.profiles
for each row
when (old.full_name is distinct from new.full_name)
execute function public.sync_visible_business_review_customer();

-- Backfill existing public-safe rows. Do not bake shop lifecycle into the
-- table: the RLS policy evaluates current visibility on every read, so a shop
-- that is reactivated can show its existing reviews without another sync.
insert into public.visible_business_reviews_data (
  order_id,
  business_id,
  rating,
  feedback,
  created_at,
  customer_name,
  item_name
)
select
  o.id,
  o.business_id,
  o.rating,
  o.feedback,
  o.created_at,
  p.full_name,
  case
    when jsonb_typeof(coalesce(o.items, '[]'::jsonb)) = 'array'
         and jsonb_array_length(coalesce(o.items, '[]'::jsonb)) > 0
      then (o.items -> 0 ->> 'name')
    else null
  end
from public.orders o
left join public.profiles p on p.id = o.customer_id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null
  and not coalesce(o.feedback_hidden, false)
on conflict (order_id) do update set
  business_id = excluded.business_id,
  rating = excluded.rating,
  feedback = excluded.feedback,
  created_at = excluded.created_at,
  customer_name = excluded.customer_name,
  item_name = excluded.item_name;

drop view if exists public.visible_business_reviews;
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
  item_name
from public.visible_business_reviews_data;

revoke all on public.visible_business_reviews
  from public, anon, authenticated;
grant select on public.visible_business_reviews
  to anon, authenticated;

commit;
