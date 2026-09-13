-- A remaining payment cannot be submitted or approved until the initial
-- downpayment snapshot has been confirmed by the owner.

begin;

create or replace function public.guard_remaining_payment_requires_initial_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.remaining_payment_status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED')
     and coalesce(new.downpayment_amount, 0) > coalesce(new.confirmed_payment_amount, 0) + 0.009 then
    raise exception 'The initial downpayment must be confirmed before submitting or approving the remaining payment';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_remaining_payment_requires_initial_confirmation() from public, anon, authenticated;
drop trigger if exists guard_remaining_payment_requires_initial_confirmation on public.orders;
create trigger guard_remaining_payment_requires_initial_confirmation
before insert or update of remaining_payment_status, confirmed_payment_amount, downpayment_amount
on public.orders
for each row execute function public.guard_remaining_payment_requires_initial_confirmation();

notify pgrst, 'reload schema';

commit;
