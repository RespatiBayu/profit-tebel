-- Add numeric_id column to master_products so a single master row can be
-- matched by EITHER seller SKU (primary) OR Shopee's numeric product ID
-- (auto-populated from income OPF). This makes product matching robust across
-- both Order.all (SKU-based) and Income (numeric-id-based) data sources.
--
-- After this migration, the system can resolve any product reference via:
--   1. marketplace_product_id (SKU)        — strongest, from Order.all + master
--   2. numeric_id                          — from income OPF
--   3. product_name (fuzzy normalized)     — fallback
ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS numeric_id TEXT;

CREATE INDEX IF NOT EXISTS idx_master_products_numeric_id
  ON master_products(user_id, numeric_id)
  WHERE numeric_id IS NOT NULL;
