-- Migration 026: add linked_item_id to master_products
-- Allows user to link a BOM output item to a master product
-- so BOM HPP auto-syncs to profit analysis on every BOM save.

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS linked_item_id uuid REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS master_products_linked_item_idx
  ON master_products (linked_item_id)
  WHERE linked_item_id IS NOT NULL;

COMMENT ON COLUMN master_products.linked_item_id IS
  'Optional link to inventory item. When set, BOM HPP is automatically synced to this master_products.hpp on every BOM save.';
