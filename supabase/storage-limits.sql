-- Storage limits for Supabase free-tier protection.
-- Run after the bucket-creation scripts. This does not change public/private
-- visibility, so existing public URLs keep working; it only enforces size and
-- MIME limits at the storage layer as a second line of defense.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-assets', 'image-assets', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-logos', 'shop-logos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images', 'chat-images', true, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
    'application/pdf', 'application/postscript', 'application/illustrator',
    'application/x-photoshop', 'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-documents', 'business-documents', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-assets', 'order-assets', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
