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
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated can upload chat images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = c.business_id AND b.owner_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated can read chat images" ON storage.objects;
CREATE POLICY "Authenticated can read chat images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = c.business_id AND b.owner_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated can update chat images" ON storage.objects;
CREATE POLICY "Authenticated can update chat images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = c.business_id AND b.owner_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = c.business_id AND b.owner_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated can delete chat images" ON storage.objects;
CREATE POLICY "Authenticated can delete chat images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = c.business_id AND b.owner_id = auth.uid()
        )
      )
  )
);

-- The migration adds the same protection for existing message rows.
create or replace function public.guard_chat_message_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_is_owner boolean;
  metadata_old jsonb;
  metadata_new jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  caller_is_owner := exists (
    select 1
    from public.chat_conversations c
    join public.businesses b on b.id = c.business_id
    where c.id = old.conversation_id and b.owner_id = caller
  );

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.sender_role is distinct from old.sender_role
     or new.created_at is distinct from old.created_at
     or new.image_url is distinct from old.image_url then
    raise exception 'Message identity and attachments cannot be changed';
  end if;

  if caller <> old.sender_id and (
    new.content is distinct from old.content
    or new.edited_at is distinct from old.edited_at
  ) then
    raise exception 'Only the message sender can edit message text';
  end if;

  if new.message_type is distinct from old.message_type
     and not (
       caller_is_owner and old.image_url is not null
       and ((old.message_type = 'text' and new.message_type = 'design_version')
         or (old.message_type = 'design_version' and new.message_type = 'text'))
     ) then
    raise exception 'Message type cannot be changed';
  end if;

  metadata_old := coalesce(old.metadata, '{}'::jsonb) - array[
    'proof_status', 'reviewed_at', 'reviewed_by', 'is_locked',
    'locked_total_amount', 'version', 'ordered', 'orderId'
  ];
  metadata_new := coalesce(new.metadata, '{}'::jsonb) - array[
    'proof_status', 'reviewed_at', 'reviewed_by', 'is_locked',
    'locked_total_amount', 'version', 'ordered', 'orderId'
  ];
  if metadata_old is distinct from metadata_new then
    raise exception 'Message metadata cannot be changed';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_chat_message_updates() from public;
drop trigger if exists guard_chat_message_updates on public.chat_messages;
create trigger guard_chat_message_updates
before update on public.chat_messages
for each row execute function public.guard_chat_message_updates();
