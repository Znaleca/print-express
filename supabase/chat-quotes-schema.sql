-- ============================================================
-- Chat Quotes & Design Versions Schema
-- Adds message_type and metadata to chat_messages
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Typical message_types:
-- 'text' (default)
-- 'design_version' -> metadata: { "version": "v1", "service_id": "..." }
-- 'quote' -> metadata: { "quote_amount": 1500, "service_id": "...", "service_name": "..." }
-- 'service_inquiry' -> metadata: { "service_id": "...", "service_name": "..." }
