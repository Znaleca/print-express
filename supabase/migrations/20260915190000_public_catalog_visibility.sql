-- Customer search must never receive unavailable catalog rows. `available` is
-- the existing catalog visibility field used by the public shop page and
-- checkout; owner/admin policies still allow authorized users to manage all
-- of their own rows.
begin;

drop policy if exists "Public can view active approved services" on public.services;
create policy "Public can view active approved services"
on public.services
for select
to anon, authenticated
using (
  available = true
  and public.is_business_customer_visible(business_id)
);

commit;
