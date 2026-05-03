-- Migration 009: orders_all table
-- Stores parsed data from Shopee "Order.all" export (semua pesanan, termasuk pending)
-- Join key to orders table: order_number

CREATE TABLE IF NOT EXISTS orders_all (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  upload_batch_id     UUID REFERENCES upload_batches(id),
  marketplace         TEXT NOT NULL DEFAULT 'shopee',
  order_number        TEXT NOT NULL,
  status_pesanan      TEXT,           -- Selesai | Batal | Telah Dikirim | Sedang Dikirim | Perlu Dikirim | Belum Bayar
  total_pembayaran    NUMERIC(12,2) DEFAULT 0,
  order_date          DATE,
  order_complete_date DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT orders_all_store_order_unique UNIQUE (store_id, order_number)
);

ALTER TABLE orders_all ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_orders_all" ON orders_all
  FOR ALL USING (user_id = auth.uid());

COMMENT ON TABLE orders_all IS 'Shopee Order.all export — semua pesanan (selesai, pending, batal). Dipakai untuk menghitung dana pending yang belum dilepas.';
COMMENT ON COLUMN orders_all.status_pesanan IS 'Status dari Shopee: Selesai | Batal | Telah Dikirim | Sedang Dikirim | Perlu Dikirim | Belum Bayar';
COMMENT ON COLUMN orders_all.total_pembayaran IS 'Total Pembayaran (jumlah yang dibayar pembeli, GMV sisi pembeli)';
