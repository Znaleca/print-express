-- ============================================================
-- Supabase Storage: shop-logos bucket
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create the storage bucket (public so logos can be viewed by anyone)
insert into storage.buckets (id, name, public)
values ('shop-logos', 'shop-logos', true)
on conflict (id) do update set public = true;

-- 2) Allow authenticated business owners to upload their own logo
--    (file path must start with their business id)
drop policy if exists "Owners can upload own logo" on storage.objects;
create policy "Owners can upload own logo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shop-logos'
  and (storage.foldername(name))[1] in (
    select id::text from public.businesses where owner_id = auth.uid()
  )
);

-- 3) Allow owners to update/replace their logo
drop policy if exists "Owners can update own logo" on storage.objects;
create policy "Owners can update own logo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shop-logos'
  and (storage.foldername(name))[1] in (
    select id::text from public.businesses where owner_id = auth.uid()
  )
);

-- 4) Allow owners to delete their logo
drop policy if exists "Owners can delete own logo" on storage.objects;
create policy "Owners can delete own logo"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shop-logos'
  and (storage.foldername(name))[1] in (
    select id::text from public.businesses where owner_id = auth.uid()
  )
);

-- 5) Public read — anyone can view logos (bucket is public)
drop policy if exists "Public can view logos" on storage.objects;
create policy "Public can view logos"
on storage.objects
for select
using (bucket_id = 'shop-logos');
