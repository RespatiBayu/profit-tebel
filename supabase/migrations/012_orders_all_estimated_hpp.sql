-- Store pre-computed HPP estimate per order so dashboard doesn't need runtime mapping.
-- Computed at upload time by cross-referencing order_products + master_products.
ALTER TABLE orders_all
  ADD COLUMN IF NOT EXISTS estimated_hpp NUMERIC(12,2) DEFAULT 0;
