-- Owner-side document locks and sequential order workflow.
-- This migration is intentionally enforced in the database as well as in the UI.

BEGIN;

-- Keep approved document objects immutable too. The table trigger protects the
-- row; this check protects a direct storage update/delete against its file.
CREATE OR REPLACE FUNCTION public.can_manage_protected_upload(
  p_bucket_id TEXT,
  p_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folders TEXT[] := storage.foldername(p_path);
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF p_bucket_id = 'private-assets' THEN
    IF folders[1] IN ('designs', 'receipts', 'documents')
       AND folders[2] = current_user_id::TEXT THEN
      IF folders[1] = 'documents'
         AND EXISTS (
           SELECT 1
           FROM public.business_documents d
           JOIN public.businesses b ON b.id = d.business_id
           WHERE b.owner_id = current_user_id
             AND d.status = 'APPROVED'
             AND (
               position(p_path IN coalesce(d.file_url, '')) > 0
               OR lower(folders[3]) ~ ('^' || lower(d.doc_type) || '[-_]')
             )
         ) THEN
        RETURN FALSE;
      END IF;
      RETURN TRUE;
    END IF;

    IF folders[1] = 'refunds'
       AND folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND EXISTS (
         SELECT 1
         FROM public.orders o
         JOIN public.businesses b ON b.id = o.business_id
         WHERE o.id = folders[2]::UUID AND b.owner_id = current_user_id
       ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF p_bucket_id = 'chat-images'
     AND folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1
       FROM public.chat_conversations c
       WHERE c.id = folders[1]::UUID
         AND (c.customer_id = current_user_id OR EXISTS (
           SELECT 1 FROM public.businesses b
           WHERE b.id = c.business_id AND b.owner_id = current_user_id
         ))
     ) THEN
    RETURN TRUE;
  END IF;

  IF p_bucket_id = 'business-documents'
     AND EXISTS (
       SELECT 1
       FROM public.business_documents d
       JOIN public.businesses b ON b.id = d.business_id
       WHERE b.owner_id = current_user_id
         AND position(p_path IN coalesce(d.file_url, '')) > 0
     ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.business_documents d
      JOIN public.businesses b ON b.id = d.business_id
      WHERE b.owner_id = current_user_id
        AND d.status = 'APPROVED'
        AND position(p_path IN coalesce(d.file_url, '')) > 0
    ) THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_protected_upload(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_protected_upload(TEXT, TEXT) TO authenticated, service_role;

-- An approved compliance document is immutable for an owner. Owners may only
-- submit a new file while a document is missing or has been sent back for action.
CREATE OR REPLACE FUNCTION public.guard_business_document_owner_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Business documents must be submitted as PENDING for review.';
  END IF;

  IF NEW.admin_comment IS NOT NULL THEN
    RAISE EXCEPTION 'Owners cannot set an admin review comment.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = NEW.business_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You may only submit documents for your own business.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_business_document_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved business documents are locked and cannot be replaced or edited.';
  END IF;

  IF OLD.status NOT IN ('REJECTED', 'NEEDS_CHANGES', 'ACTION_REQUIRED')
    AND NOT (OLD.status = 'PENDING' AND NEW.file_url IS NULL)
    AND (
      OLD.file_url IS DISTINCT FROM NEW.file_url
      OR OLD.file_name IS DISTINCT FROM NEW.file_name
      OR OLD.file_size_bytes IS DISTINCT FROM NEW.file_size_bytes
      OR OLD.file_type IS DISTINCT FROM NEW.file_type
      OR OLD.file_format IS DISTINCT FROM NEW.file_format
    ) THEN
    RAISE EXCEPTION 'Business document replacements are only available after an admin requests action.';
  END IF;

  IF OLD.business_id IS DISTINCT FROM NEW.business_id
    OR OLD.doc_type IS DISTINCT FROM NEW.doc_type
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Owners cannot change the identity of a business document.';
  END IF;

  IF NEW.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Owners may only submit business documents for review.';
  END IF;

  IF NEW.admin_comment IS DISTINCT FROM OLD.admin_comment
    AND NOT (
      OLD.status = 'REJECTED'
      AND NEW.admin_comment IS NULL
      AND NEW.file_url IS DISTINCT FROM OLD.file_url
    ) THEN
    RAISE EXCEPTION 'Owners cannot change an admin review comment.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_documents_owner_insert_guard ON public.business_documents;
CREATE TRIGGER business_documents_owner_insert_guard
BEFORE INSERT ON public.business_documents
FOR EACH ROW
EXECUTE FUNCTION public.guard_business_document_owner_insert();

DROP TRIGGER IF EXISTS business_documents_owner_update_guard ON public.business_documents;
CREATE TRIGGER business_documents_owner_update_guard
BEFORE UPDATE ON public.business_documents
FOR EACH ROW
EXECUTE FUNCTION public.guard_business_document_owner_update();

DROP POLICY IF EXISTS "Owners can insert own documents" ON public.business_documents;
DROP POLICY IF EXISTS "Owners can insert own business documents" ON public.business_documents;
CREATE POLICY "Owners can insert own business documents"
ON public.business_documents FOR INSERT
TO authenticated
WITH CHECK (
  status = 'PENDING'
  AND admin_comment IS NULL
  AND EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = business_documents.business_id AND owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners can update own documents" ON public.business_documents;
DROP POLICY IF EXISTS "Owners can update own business documents" ON public.business_documents;
CREATE POLICY "Owners can update own business documents"
ON public.business_documents FOR UPDATE
TO authenticated
USING (
  status <> 'APPROVED'
  AND EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = business_documents.business_id AND owner_id = auth.uid()
  )
)
WITH CHECK (
  status = 'PENDING'
  AND admin_comment IS NULL
  AND EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = business_documents.business_id AND owner_id = auth.uid()
  )
);

-- The only owner progression is the immediate next state for the order's
-- fulfillment mode. This helper is also used by the RPC for a clear error.
CREATE OR REPLACE FUNCTION public.expected_owner_order_next_status(
  p_current_status TEXT,
  p_delivery_type TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_current_status = 'PENDING' THEN 'PLACED'
    WHEN p_current_status = 'PLACED' THEN 'PREPARING'
    WHEN p_current_status = 'PREPARING' AND UPPER(COALESCE(p_delivery_type, 'PICKUP')) = 'DELIVERY' THEN 'RIDER_ON_THE_WAY'
    WHEN p_current_status = 'PREPARING' THEN 'READY_TO_PICK_UP'
    WHEN p_current_status = 'READY_TO_PICK_UP' THEN 'COMPLETED'
    WHEN p_current_status = 'RIDER_ON_THE_WAY' THEN 'DELIVERY_COMPLETED'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  expected_status TEXT;
  is_owner BOOLEAN;
  is_customer BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  is_owner := EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = NEW.business_id AND owner_id = caller
  );
  is_customer := NEW.customer_id = caller;

  IF is_owner THEN
    expected_status := public.expected_owner_order_next_status(OLD.status, NEW.delivery_type);

    IF NEW.status = expected_status THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'CANCELLED' AND OLD.status IN ('PENDING', 'PLACED', 'PREPARING') THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'REFUNDED'
      AND OLD.status IN ('CANCELLED', 'REFUND_PENDING')
      AND NEW.refund_proof_url IS NOT NULL THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid order status transition from % to %. The next available status is %.',
      OLD.status, NEW.status, COALESCE(expected_status, 'none');
  END IF;

  IF is_customer THEN
    IF NEW.status = 'CANCELLED' AND OLD.status IN ('PENDING', 'PLACED', 'PREPARING') THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'REFUND_PENDING' AND OLD.status IN ('CANCELLED', 'REFUNDED') THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'REFUND_CONFIRMED' AND OLD.status = 'REFUNDED' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'You are not allowed to change this order from % to %.', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS orders_status_transition_guard ON public.orders;
CREATE TRIGGER orders_status_transition_guard
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_status_transition();

-- Frontends use this RPC for owner progression so a stale screen gets a
-- server-generated error and cannot race a second status update.
CREATE OR REPLACE FUNCTION public.owner_advance_order_status(
  p_order_id UUID,
  p_next_status TEXT
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_order public.orders;
  expected_status TEXT;
  next_status TEXT := UPPER(TRIM(p_next_status));
BEGIN
  SELECT o.* INTO target_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id AND b.owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or you do not own this order.';
  END IF;

  expected_status := public.expected_owner_order_next_status(target_order.status, target_order.delivery_type);
  IF next_status IS DISTINCT FROM expected_status THEN
    RAISE EXCEPTION 'Invalid order status transition from % to %. The next available status is %.',
      target_order.status, next_status, COALESCE(expected_status, 'none');
  END IF;

  UPDATE public.orders
  SET status = next_status
  WHERE id = p_order_id;

  RETURN QUERY SELECT * FROM public.orders WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_advance_order_status(UUID, TEXT) TO authenticated;

COMMIT;
