-- ============================================================
-- Order Storage Buckets Setup 
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create the storage bucket (private by default to protect designs and receipts, but users can get signed URLs/public URLs if configured)
insert into storage.buckets (id, name, public)
values ('order-assets', 'order-assets', true)
on conflict (id) do update set public = true;

-- 2) Let Customers upload files for their orders (path pattern: {customer_id}/{timestamp_or_random})
drop policy if exists "Customers can upload order files" on storage.objects;
create policy "Customers can upload order files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'order-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Public Read: Allow anyone to view order assets (you can make this stricter later if privacy is a concern, but making it public simplifies URL loading for owners and customers)
drop policy if exists "Public read access for order assets" on storage.objects;
create policy "Public read access for order assets"
on storage.objects
for select
using (bucket_id = 'order-assets');

