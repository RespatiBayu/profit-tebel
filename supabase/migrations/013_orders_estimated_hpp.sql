-- Store pre-computed HPP estimate per confirmed income order.
-- Computed at income upload time from Order Processing Fee sheet × master_products.
-- This provides a direct HPP source for confirmed orders without needing
-- cross-referencing through orders_all.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_hpp NUMERIC(12,2) DEFAULT 0;
