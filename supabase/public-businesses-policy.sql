-- Public read access for the customer-facing shop directory.
-- Run this in Supabase SQL Editor.

grant select on public.businesses to anon, authenticated;

drop policy if exists "Public can view approved businesses" on public.businesses;
create policy "Public can view approved businesses"
on public.businesses
for select
to anon, authenticated
using (status = 'APPROVED');
