-- ============================================================
-- Fix: Allow customers to upsert (insert + update) their own
--      chat_conversations so the refund dispute flow works.
-- Run this in Supabase SQL Editor
-- ============================================================

-- Allow customers to update their own conversations
-- (needed so upsert can touch existing rows)
DROP POLICY IF EXISTS "Customers can update their own conversations" ON public.chat_conversations;
CREATE POLICY "Customers can update their own conversations"
  ON public.chat_conversations FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());
