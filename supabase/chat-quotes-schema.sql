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
-- 'design_upload' -> metadata: { "file_name": "...", "file_type": "Print PDF", "file_format": "pdf", "file_size_bytes": 12345, "quality_notes": "..." }
-- 'proof_status' -> metadata: { "proof_id": "...", "proof_status": "APPROVED", "is_locked": true }
-- 'quote' -> metadata: { "quote_amount": 1500, "service_id": "...", "service_name": "..." }
-- 'video_call' -> metadata: { "capabilities": ["camera", "microphone", "screen share", "chat", "raise hand", "tile view"] }
-- 'generated_guidance' -> metadata: { "question_key": "file_check" }
-- 'service_inquiry' -> metadata: { "service_id": "...", "service_name": "..." }
