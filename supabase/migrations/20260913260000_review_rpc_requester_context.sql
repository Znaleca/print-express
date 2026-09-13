-- Pass the already-validated application user through server-side RPC calls.
-- API routes use service_role for privileged reads, so auth.uid() is not the
-- end-user identity inside those calls. Direct authenticated clients still
-- have to match auth.uid() to p_requester_id.
begin;

drop function if exists public.request_review_removal(uuid, text);
drop function if exists public.moderate_review_removal(uuid, text, text);
drop function if exists public.set_admin_review_visibility(uuid, boolean, text);

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
  if exists (
    select 1 from public.review_moderation_requests r
    where r.order_id = p_order_id and r.status = 'PENDING'
  ) then
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
  if caller is null then raise exception 'Admin access required'; end if;
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

  insert into public.review_moderation_history (order_id, business_id, action, note, actor_id)
  values (
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

revoke all on function public.request_review_removal(uuid, text, uuid) from public, anon;
grant execute on function public.request_review_removal(uuid, text, uuid) to authenticated;
revoke all on function public.moderate_review_removal(uuid, text, text, uuid) from public, anon;
grant execute on function public.moderate_review_removal(uuid, text, text, uuid) to authenticated;
revoke all on function public.set_admin_review_visibility(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.set_admin_review_visibility(uuid, boolean, text, uuid) to authenticated;

commit;
