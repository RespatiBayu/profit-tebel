-- Migration 028: Tambah kolom min_stock_qty ke tabel items
-- Dipakai untuk alert stok minimum (low stock warning)

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS min_stock_qty numeric(12,4) DEFAULT 0 NOT NULL;

COMMENT ON COLUMN items.min_stock_qty IS 'Batas stok minimum. Alert muncul jika qty_on_hand <= min_stock_qty.';
