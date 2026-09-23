-- Review moderation hides written feedback only. Ratings remain part of the
-- public review projection so shop averages and star displays do not change.

begin;

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
     and new.rating is not null then
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
      new.id, new.business_id, new.rating,
      case when coalesce(new.feedback_hidden, false) then null else coalesce(new.feedback_masked, public.mask_review_text(new.feedback)) end,
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

-- Reinsert older comments that were removed from the projection when they
-- were hidden by the previous implementation, preserving their ratings.
insert into public.visible_business_reviews_data (
  order_id, business_id, rating, feedback, created_at, customer_name,
  item_name, review_service_id, review_target_name, review_target_type
)
select
  o.id,
  o.business_id,
  o.rating,
  case when coalesce(o.feedback_hidden, false) then null else coalesce(o.feedback_masked, public.mask_review_text(o.feedback)) end,
  o.created_at,
  p.full_name,
  s.name,
  o.review_service_id,
  s.name,
  s.item_type
from public.orders o
left join public.profiles p on p.id = o.customer_id
left join public.services s on s.id = o.review_service_id
where o.status in ('COMPLETED', 'DELIVERY_COMPLETED')
  and o.rating is not null
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

drop view if exists public.visible_order_item_reviews;
create view public.visible_order_item_reviews
as
select
  r.id as review_id,
  r.order_id,
  r.business_id,
  r.rating,
  case when r.feedback_hidden then null else r.feedback_masked end as feedback,
  r.created_at,
  'Verified Customer'::text as customer_name,
  r.item_name,
  r.service_id as review_service_id,
  r.item_name as review_target_name,
  r.item_type as review_target_type
from public.order_item_reviews r
where public.is_business_customer_visible(r.business_id);

revoke all on public.visible_order_item_reviews from public, anon, authenticated;
grant select on public.visible_order_item_reviews to anon, authenticated;

drop policy if exists "Admins can read all item reviews" on public.order_item_reviews;
create policy "Admins can read all item reviews"
on public.order_item_reviews for select to authenticated
using (public.is_admin());

create or replace function public.set_admin_item_review_visibility(
  p_review_id uuid,
  p_hidden boolean,
  p_note text default null,
  p_requester_id uuid default null
)
returns public.order_item_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := p_requester_id;
  review_row public.order_item_reviews;
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

  select * into review_row
  from public.order_item_reviews
  where id = p_review_id
  for update;
  if not found then raise exception 'Review not found'; end if;

  update public.order_item_reviews
  set feedback_hidden = p_hidden,
      feedback_hidden_at = case when p_hidden then now() else null end,
      feedback_hidden_by = case when p_hidden then 'admin' else null end,
      updated_at = now()
  where id = p_review_id;

  insert into public.review_moderation_history (
    order_id, business_id, action, note, actor_id
  ) values (
    review_row.order_id,
    review_row.business_id,
    case when p_hidden then 'HIDDEN' else 'RESTORED' end,
    nullif(trim(coalesce(p_note, '')), ''),
    caller
  );

  select * into review_row from public.order_item_reviews where id = p_review_id;
  return review_row;
end;
$$;

revoke all on function public.set_admin_item_review_visibility(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.set_admin_item_review_visibility(uuid, boolean, text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
