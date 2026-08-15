-- ====================================================================
-- PRINTING PRODUCTS & SERVICES UPGRADE MIGRATION (ADDITIVE NEW TABLES ONLY)
-- Press & Present Printing Marketplace
-- ====================================================================

-- 1. NEW TABLE: SERVICE PRICING RULES (Option-based pricing modifiers)
CREATE TABLE IF NOT EXISTS public.service_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    option_type TEXT NOT NULL, -- 'SIZE', 'MATERIAL', 'QUALITY', 'CUSTOMIZATION'
    option_name TEXT NOT NULL, -- e.g. 'A3 (11.69" × 16.54")', 'Matte Cardstock (300gsm)'
    price_modifier NUMERIC(10,2) DEFAULT 0.00,
    price_multiplier NUMERIC(10,2) DEFAULT 1.00,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. NEW TABLE: INVENTORY MOVEMENTS (Stock History for Physical Products)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    qty_change INTEGER NOT NULL,
    new_stock_qty INTEGER NOT NULL,
    reason TEXT NOT NULL, -- 'RESTOCK', 'ORDER_DEDUCTION', 'MANUAL_ADJUSTMENT'
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on New Tables Only
ALTER TABLE public.service_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for New Tables
DROP POLICY IF EXISTS "Public can view pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Public can view pricing rules" ON public.service_pricing_rules FOR SELECT
USING (
  active = true
  AND business_id IN (SELECT id FROM public.businesses WHERE status = 'APPROVED')
);

DROP POLICY IF EXISTS "Owners can edit pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Owners can edit pricing rules" ON public.service_pricing_rules FOR ALL
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Owners can manage inventory movements" ON public.inventory_movements FOR ALL
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
