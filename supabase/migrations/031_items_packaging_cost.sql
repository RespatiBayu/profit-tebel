-- Migration 031: Tambah kolom packaging_cost ke tabel items
-- HPP & biaya packaging untuk barang jadi diinput di Master Item, lalu
-- disalin ke master_products (Mapping Produk) saat produk di-link.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS packaging_cost numeric(12,2) DEFAULT 0 NOT NULL;

COMMENT ON COLUMN items.packaging_cost IS 'Biaya packaging per unit untuk barang jadi. Disalin ke master_products.packaging_cost saat produk di-link.';
