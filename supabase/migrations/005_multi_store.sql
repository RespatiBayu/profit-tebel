-- Migration 005: Multi-store support
-- Run this in Supabase SQL Editor AFTER 004_backfill_and_dedup.sql

-- ============================================================
-- PART 1: Create stores table
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name, marketplace)
);

CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own stores" ON stores;
CREATE POLICY "Users see own stores" ON stores FOR ALL USING (auth.uid() = user_id);

-- Reuse update_updated_at_column() from 001
DROP TRIGGER IF EXISTS update_stores_updated_at ON stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PART 2: Add store_id columns (nullable during backfill)
-- ============================================================
ALTER TABLE orders          ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE order_products  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE ads_data        ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE upload_batches  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_order_products_store ON order_products(store_id);
CREATE INDEX IF NOT EXISTS idx_ads_data_store ON ads_data(store_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_store ON upload_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_master_products_store ON master_products(store_id);

-- ============================================================
-- PART 3: Backfill — create default "Toko Utama" per user+marketplace
-- ============================================================
INSERT INTO stores (user_id, name, marketplace)
SELECT DISTINCT user_id, 'Toko Utama', marketplace FROM upload_batches
WHERE user_id IS NOT NULL AND marketplace IS NOT NULL
ON CONFLICT (user_id, name, marketplace) DO NOTHING;

-- Also from master_products (user might have products without upload yet)
INSERT INTO stores (user_id, name, marketplace)
SELECT DISTINCT user_id, 'Toko Utama', marketplace FROM master_products
WHERE user_id IS NOT NULL AND marketplace IS NOT NULL
ON CONFLICT (user_id, name, marketplace) DO NOTHING;

-- Backfill store_id on each table
UPDATE orders o SET store_id = s.id
FROM stores s
WHERE s.user_id = o.user_id AND s.marketplace = o.marketplace AND s.name = 'Toko Utama'
  AND o.store_id IS NULL;

UPDATE ads_data a SET store_id = s.id
FROM stores s
WHERE s.user_id = a.user_id AND s.marketplace = a.marketplace AND s.name = 'Toko Utama'
  AND a.store_id IS NULL;

UPDATE upload_batches b SET store_id = s.id
FROM stores s
WHERE s.user_id = b.user_id AND s.marketplace = b.marketplace AND s.name = 'Toko Utama'
  AND b.store_id IS NULL;

UPDATE master_products mp SET store_id = s.id
FROM stores s
WHERE s.user_id = mp.user_id AND s.marketplace = mp.marketplace AND s.name = 'Toko Utama'
  AND mp.store_id IS NULL;

-- order_products doesn't have its own marketplace column — derive from orders
UPDATE order_products op SET store_id = o.store_id
FROM orders o
WHERE o.order_number = op.order_number AND o.user_id = op.user_id AND op.store_id IS NULL;

-- ============================================================
-- PART 4: Replace unique constraints to be store-scoped
-- ============================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_marketplace_order_unique;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_order_unique;
ALTER TABLE orders ADD CONSTRAINT orders_store_order_unique
  UNIQUE (store_id, order_number);

ALTER TABLE order_products DROP CONSTRAINT IF EXISTS order_products_user_order_product_unique;
ALTER TABLE order_products DROP CONSTRAINT IF EXISTS order_products_store_order_product_unique;
ALTER TABLE order_products ADD CONSTRAINT order_products_store_order_product_unique
  UNIQUE (store_id, order_number, marketplace_product_id);

ALTER TABLE ads_data DROP CONSTRAINT IF EXISTS ads_data_user_product_period_unique;
ALTER TABLE ads_data DROP CONSTRAINT IF EXISTS ads_data_store_product_period_unique;
ALTER TABLE ads_data ADD CONSTRAINT ads_data_store_product_period_unique
  UNIQUE (store_id, product_code, report_period_start, report_period_end);

-- master_products original unique was (user_id, marketplace_product_id, marketplace) — drop & replace
ALTER TABLE master_products DROP CONSTRAINT IF EXISTS master_products_user_id_marketplace_product_id_marketplace_key;
ALTER TABLE master_products DROP CONSTRAINT IF EXISTS master_products_store_product_unique;
ALTER TABLE master_products ADD CONSTRAINT master_products_store_product_unique
  UNIQUE (store_id, marketplace_product_id);

-- ============================================================
-- Done. Verify with:
--   SELECT user_id, COUNT(*) FROM stores GROUP BY user_id;
--   SELECT COUNT(*) FROM orders WHERE store_id IS NULL;  -- should be 0
-- ============================================================
