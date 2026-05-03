-- Add item_type to distinguish services (price range) from products (exact price + stock)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('service', 'product')),
  ADD COLUMN IF NOT EXISTS price_max NUMERIC(10,2);

-- For existing rows: keep as 'service' (default), price stays as price_min equivalent
-- price_max NULL means single price; for products price_max is also NULL (uses price field)
