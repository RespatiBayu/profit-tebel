-- Migration 022: Purchase Orders (Pembelian Bahan)

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id      uuid REFERENCES stores(id) ON DELETE SET NULL,
  po_number     text,                                        -- nomor PO internal (opsional, auto-generate jika kosong)
  date          date NOT NULL,
  supplier      text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'confirmed', 'received', 'cancelled')),
  notes         text,
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,           -- di-update saat lines berubah
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_ordered   numeric(12,4) NOT NULL,
  qty_received  numeric(12,4) NOT NULL DEFAULT 0,
  unit_cost     numeric(12,2) NOT NULL,
  -- total_cost dihitung di aplikasi (PostgreSQL GENERATED ALWAYS AS tidak support expression sederhana di semua versi)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS po_user_id_idx      ON purchase_orders (user_id);
CREATE INDEX IF NOT EXISTS po_store_id_idx     ON purchase_orders (store_id);
CREATE INDEX IF NOT EXISTS po_status_idx       ON purchase_orders (user_id, status);
CREATE INDEX IF NOT EXISTS pol_po_id_idx       ON purchase_order_lines (po_id);
CREATE INDEX IF NOT EXISTS pol_item_id_idx     ON purchase_order_lines (item_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_po_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER po_updated_at_trigger
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_po_updated_at();

-- Auto-update total_amount di purchase_orders saat lines berubah
CREATE OR REPLACE FUNCTION sync_po_total_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_id uuid;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  UPDATE purchase_orders
  SET total_amount = (
    SELECT COALESCE(SUM(qty_ordered * unit_cost), 0)
    FROM purchase_order_lines
    WHERE po_id = v_po_id
  )
  WHERE id = v_po_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pol_sync_total_after_insert
  AFTER INSERT ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

CREATE TRIGGER pol_sync_total_after_update
  AFTER UPDATE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

CREATE TRIGGER pol_sync_total_after_delete
  AFTER DELETE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

-- RLS: purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po: user sees own" ON purchase_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "po: user inserts own" ON purchase_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "po: user updates own" ON purchase_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "po: user deletes own" ON purchase_orders
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: purchase_order_lines
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pol: user sees own" ON purchase_order_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = purchase_order_lines.po_id
        AND purchase_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "pol: user inserts own" ON purchase_order_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = purchase_order_lines.po_id
        AND purchase_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "pol: user updates own" ON purchase_order_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = purchase_order_lines.po_id
        AND purchase_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "pol: user deletes own" ON purchase_order_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = purchase_order_lines.po_id
        AND purchase_orders.user_id = auth.uid()
    )
  );
