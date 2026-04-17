-- ============================================================
-- Chat Enhancements
-- Adds unread counters, image support, edit metadata, and update/delete policies
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Message metadata columns
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2) Ensure text-only legacy rows are considered read-safe defaults
UPDATE public.chat_messages
SET is_read = false
WHERE is_read IS NULL;

-- 3) Allow participants to update messages (used for edit + mark-as-read)
DROP POLICY IF EXISTS "Participants can update messages" ON public.chat_messages;
CREATE POLICY "Participants can update messages"
ON public.chat_messages FOR UPDATE TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.chat_conversations
    WHERE customer_id = auth.uid()
       OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  )
)
WITH CHECK (
  conversation_id IN (
    SELECT id FROM public.chat_conversations
    WHERE customer_id = auth.uid()
       OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  )
);

-- 4) Allow participants to delete their own messages
DROP POLICY IF EXISTS "Participants can delete own messages" ON public.chat_messages;
CREATE POLICY "Participants can delete own messages"
ON public.chat_messages FOR DELETE TO authenticated
USING (
  sender_id = auth.uid()
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations
    WHERE customer_id = auth.uid()
       OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  )
);

-- 5) Storage bucket for chat images
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated can upload chat images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Authenticated can read chat images" ON storage.objects;
CREATE POLICY "Authenticated can read chat images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Authenticated can update chat images" ON storage.objects;
CREATE POLICY "Authenticated can update chat images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Authenticated can delete chat images" ON storage.objects;
CREATE POLICY "Authenticated can delete chat images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-images');
