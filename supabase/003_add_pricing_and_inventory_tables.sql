-- ====================================================================
-- NEW STANDALONE MIGRATION: 003_add_pricing_and_inventory_tables.sql
-- Press & Present Printing Marketplace
-- Paste this script into your Supabase SQL Editor once.
-- ====================================================================

-- 1. Create separate table for option-based pricing rules (Sizes, Materials, Quality Modifiers)
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

-- Ensure all columns exist safely
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS price_modifier NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS price_multiplier NUMERIC(10,2) DEFAULT 1.00;
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.service_pricing_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create separate table for physical product inventory movements
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

-- 3. Safely update services table constraints if needed (additive columns only)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS specs_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT TRUE;

ALTER TABLE public.services ALTER COLUMN stock_qty SET DEFAULT 0;
ALTER TABLE public.services ALTER COLUMN stock_qty DROP NOT NULL;

-- 4. Enable Row Level Security
ALTER TABLE public.service_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for New Tables
DROP POLICY IF EXISTS "Public can view pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Public can view pricing rules" ON public.service_pricing_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can edit pricing rules" ON public.service_pricing_rules;
CREATE POLICY "Owners can edit pricing rules" ON public.service_pricing_rules FOR ALL USING (true);

DROP POLICY IF EXISTS "Owners can manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Owners can manage inventory movements" ON public.inventory_movements FOR ALL USING (true);
