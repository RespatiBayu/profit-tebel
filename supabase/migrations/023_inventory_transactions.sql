-- Migration 023: Inventory Transactions + Stock View
-- Setiap pergerakan stok masuk/keluar dicatat di sini (append-only log)
-- Saldo stok = SUM(qty) per item

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id          uuid REFERENCES stores(id) ON DELETE SET NULL,
  item_id           uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  transaction_type  text NOT NULL CHECK (transaction_type IN (
    'purchase_in',    -- stok masuk dari Purchase Order (receive)
    'production_in',  -- stok masuk sebagai output produksi
    'production_out', -- stok keluar sebagai bahan input produksi
    'sale_out',       -- stok keluar karena penjualan (dari orders_all Selesai)
    'adjustment'      -- koreksi manual (positif = tambah, negatif = kurang)
  )),
  reference_id      uuid,          -- id dari PO / production_order / order_all
  reference_type    text,          -- 'purchase_order' | 'production_order' | 'order_all'
  qty               numeric(12,4) NOT NULL,  -- positif = masuk stok, negatif = keluar stok
  unit_cost         numeric(12,2),           -- harga per unit saat transaksi (null untuk sale_out/adjustment)
  date              date NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invtx_user_id_idx    ON inventory_transactions (user_id);
CREATE INDEX IF NOT EXISTS invtx_store_id_idx   ON inventory_transactions (store_id);
CREATE INDEX IF NOT EXISTS invtx_item_id_idx    ON inventory_transactions (item_id);
CREATE INDEX IF NOT EXISTS invtx_type_idx       ON inventory_transactions (user_id, transaction_type);
CREATE INDEX IF NOT EXISTS invtx_date_idx       ON inventory_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS invtx_ref_idx        ON inventory_transactions (reference_id) WHERE reference_id IS NOT NULL;

-- View: saldo stok terkini per item per user (moving average cost)
CREATE OR REPLACE VIEW item_stock AS
  SELECT
    user_id,
    store_id,
    item_id,
    SUM(qty)::numeric(12,4)                                         AS qty_on_hand,
    -- Moving average cost: hanya dari transaksi masuk (qty > 0) yang punya unit_cost
    CASE
      WHEN SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty ELSE 0 END) > 0
      THEN (
        SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty * unit_cost ELSE 0 END) /
        SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty ELSE 0 END)
      )::numeric(12,2)
      ELSE NULL
    END                                                              AS avg_cost,
    MAX(date)                                                        AS last_transaction_date,
    COUNT(*)                                                         AS transaction_count
  FROM inventory_transactions
  GROUP BY user_id, store_id, item_id;

-- RLS: inventory_transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invtx: user sees own" ON inventory_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "invtx: user inserts own" ON inventory_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update & Delete dibatasi hanya untuk type 'adjustment' (koreksi manual)
-- production_in/out, purchase_in, sale_out tidak boleh dihapus manual (integritas audit)
CREATE POLICY "invtx: user updates adjustment only" ON inventory_transactions
  FOR UPDATE USING (auth.uid() = user_id AND transaction_type = 'adjustment');

CREATE POLICY "invtx: user deletes adjustment only" ON inventory_transactions
  FOR DELETE USING (auth.uid() = user_id AND transaction_type = 'adjustment');
