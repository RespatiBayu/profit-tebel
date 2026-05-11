-- Add quantity column to order_products so HPP × qty calculation is accurate.
-- Order.all has multiple rows per order with explicit Jumlah (qty) per SKU.
-- Default 1 preserves behavior for any existing income-OPF rows.
ALTER TABLE order_products
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
