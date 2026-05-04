-- Allow customers to insert automated bot replies on behalf of the business owner
-- This is necessary so the Quick Replies feature works client-side.
DROP POLICY IF EXISTS "Customers can insert bot replies for the owner" ON public.chat_messages;
CREATE POLICY "Customers can insert bot replies for the owner"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_role = 'BUSINESS_OWNER'
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE customer_id = auth.uid()
  )
);
