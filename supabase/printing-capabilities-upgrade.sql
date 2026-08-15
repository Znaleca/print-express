-- ====================================================================
-- PRINTING PLATFORM CAPABILITIES UPGRADE MIGRATION (ADDITIVE NEW TABLES ONLY)
-- Press & Present Printing Marketplace
-- ====================================================================

-- 1. SERVICE PRICING RULES & CUSTOM OPTIONS (Sizes, Materials, Quality)
CREATE TABLE IF NOT EXISTS public.service_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    option_type TEXT NOT NULL, -- 'SIZE', 'MATERIAL', 'QUALITY'
    option_name TEXT NOT NULL, -- e.g. 'A4', 'Glossy 220gsm', 'High Quality (1440 DPI)'
    price_modifier NUMERIC(10,2) DEFAULT 0.00,
    price_multiplier NUMERIC(10,2) DEFAULT 1.00,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INVENTORY MOVEMENTS (Stock History for Physical Products)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    qty_change INTEGER NOT NULL,
    new_stock_qty INTEGER NOT NULL,
    reason TEXT NOT NULL, -- 'RESTOCK', 'ORDER_DEDUCTION', 'MANUAL_ADJUSTMENT'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DESIGN PROOFS & VERSION CONTROL
CREATE TABLE IF NOT EXISTS public.design_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_size_bytes BIGINT,
    file_type TEXT,
    file_format TEXT,
    quality_notes TEXT,
    notes TEXT,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES'
    is_locked BOOLEAN DEFAULT FALSE,
    uploaded_by UUID NOT NULL,
    uploaded_role TEXT NOT NULL, -- 'CUSTOMER' or 'BUSINESS_OWNER'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.design_proofs
    ADD COLUMN IF NOT EXISTS file_format TEXT,
    ADD COLUMN IF NOT EXISTS quality_notes TEXT,
    ADD COLUMN IF NOT EXISTS locked_total_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 4. FORMAL ORDER DOCUMENTS (Quotations, Delivery Receipts, Sales Invoices)
CREATE TABLE IF NOT EXISTS public.order_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- 'QUOTATION', 'DELIVERY_RECEIPT', 'SALES_INVOICE'
    document_number TEXT UNIQUE NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    tax_amount NUMERIC(10,2) DEFAULT 0.00,
    total_amount NUMERIC(10,2) NOT NULL,
    downpayment_amount NUMERIC(10,2) DEFAULT 0.00,
    balance_amount NUMERIC(10,2) DEFAULT 0.00,
    terms_notes TEXT,
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ
);

-- 5. CUSTOM CATEGORY APPROVAL REQUESTS
CREATE TABLE IF NOT EXISTS public.category_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    category_name TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business document upload metadata for owner/admin verification screens
ALTER TABLE public.business_documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.business_documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE public.business_documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.business_documents ADD COLUMN IF NOT EXISTS file_format TEXT;
ALTER TABLE public.business_documents ADD COLUMN IF NOT EXISTS quality_requirement TEXT DEFAULT '300 DPI clear scan or sharp unedited photo';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quotation_valid_until TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quotation_terms TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- 6. SMS NOTIFICATION LOGS (Placeholder for future SMS provider integration)
CREATE TABLE IF NOT EXISTS public.sms_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    recipient_phone TEXT NOT NULL,
    message_content TEXT NOT NULL,
    status TEXT DEFAULT 'LOGGED_DISABLED',
    provider TEXT DEFAULT 'Semaphore',
    provider_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS Policies on New Tables
ALTER TABLE public.service_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_notification_logs ENABLE ROW LEVEL SECURITY;

-- Public pricing is restricted to active rules for approved businesses.
DROP POLICY IF EXISTS "Public can view pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Public can view pricing rules" ON public.service_pricing_rules FOR SELECT
USING (
  active = true
  AND business_id IN (SELECT id FROM public.businesses WHERE status = 'APPROVED')
);

DROP POLICY IF EXISTS "Public can view design proofs" ON public.design_proofs;
CREATE POLICY "Participants can view design proofs" ON public.design_proofs FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR order_id IN (
    SELECT o.id
    FROM public.orders o
    WHERE o.customer_id = auth.uid()
       OR o.business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  )
  OR conversation_id IN (
    SELECT c.id
    FROM public.chat_conversations c
    WHERE c.customer_id = auth.uid()
       OR c.business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Owners can edit pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Owners can edit pricing rules" ON public.service_pricing_rules FOR ALL
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert proofs" ON public.design_proofs;
CREATE POLICY "Users can insert proofs" ON public.design_proofs FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "Users can update proofs" ON public.design_proofs;
CREATE POLICY "Users can update proofs" ON public.design_proofs FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "Owners can create category approval requests" ON public.category_approval_requests;
CREATE POLICY "Owners can create category approval requests"
ON public.category_approval_requests FOR INSERT
TO authenticated
WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners can view own category approval requests" ON public.category_approval_requests;
CREATE POLICY "Owners can view own category approval requests"
ON public.category_approval_requests FOR SELECT
TO authenticated
USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage category approval requests" ON public.category_approval_requests;
CREATE POLICY "Admins can manage category approval requests"
ON public.category_approval_requests FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
