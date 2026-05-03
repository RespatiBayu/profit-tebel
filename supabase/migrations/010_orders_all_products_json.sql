-- Add products_json column to orders_all for per-SKU HPP estimation
-- Stores array of {marketplace_product_id, product_name, quantity} per order
ALTER TABLE orders_all
  ADD COLUMN IF NOT EXISTS products_json JSONB DEFAULT '[]'::jsonb;
