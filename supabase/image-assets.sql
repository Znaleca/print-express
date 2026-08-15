-- Dedicated optimized image bucket for public shop/service previews,
-- payment proofs, chat images, and verification photos.
-- Run this once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-assets',
  'image-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

drop policy if exists "Authenticated users can upload image assets" on storage.objects;
create policy "Authenticated users can upload image assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'image-assets');

drop policy if exists "Public can view image assets" on storage.objects;
create policy "Public can view image assets"
on storage.objects for select
using (bucket_id = 'image-assets');

drop policy if exists "Authenticated users can update image assets" on storage.objects;
create policy "Authenticated users can update image assets"
on storage.objects for update to authenticated
using (bucket_id = 'image-assets');

drop policy if exists "Authenticated users can delete image assets" on storage.objects;
create policy "Authenticated users can delete image assets"
on storage.objects for delete to authenticated
using (bucket_id = 'image-assets');
