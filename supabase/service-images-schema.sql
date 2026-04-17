-- ============================================================
-- Service Images Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Add image_url to services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Storage bucket for service images
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload service images" ON storage.objects;
CREATE POLICY "Authenticated can upload service images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Authenticated can read service images" ON storage.objects;
CREATE POLICY "Authenticated can read service images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Authenticated can update service images" ON storage.objects;
CREATE POLICY "Authenticated can update service images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Authenticated can delete service images" ON storage.objects;
CREATE POLICY "Authenticated can delete service images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'service-images');
