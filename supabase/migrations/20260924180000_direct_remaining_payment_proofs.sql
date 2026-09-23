-- Remaining payment proofs are uploaded by the authenticated customer
-- directly to Supabase Storage. The API receives only the storage reference.

BEGIN;

DROP POLICY IF EXISTS "Customers can upload remaining payment proofs" ON storage.objects;
CREATE POLICY "Customers can upload remaining payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'private-assets'
  AND (storage.foldername(name))[1] = 'payments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[3]
      AND o.customer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Customers can replace remaining payment proofs" ON storage.objects;
CREATE POLICY "Customers can replace remaining payment proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'private-assets'
  AND (storage.foldername(name))[1] = 'payments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[3]
      AND o.customer_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'private-assets'
  AND (storage.foldername(name))[1] = 'payments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[3]
      AND o.customer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Customers can delete remaining payment proofs" ON storage.objects;
CREATE POLICY "Customers can delete remaining payment proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'private-assets'
  AND (storage.foldername(name))[1] = 'payments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[3]
      AND o.customer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authorized users can view remaining payment proofs" ON storage.objects;
CREATE POLICY "Authorized users can view remaining payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'private-assets'
  AND (storage.foldername(name))[1] = 'payments'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    LEFT JOIN public.businesses b ON b.id = o.business_id
    WHERE o.id::text = (storage.foldername(name))[3]
      AND (
        o.customer_id = auth.uid()
        OR b.owner_id = auth.uid()
        OR public.is_admin()
      )
  )
);

COMMIT;
