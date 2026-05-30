-- Migration 024: Production Orders
-- Proses produksi: konversi bahan → barang setengah jadi / barang jadi
-- Satu production_order mengacu ke 1 BOM dan qty yang diproduksi

CREATE TABLE IF NOT EXISTS production_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id      uuid REFERENCES stores(id) ON DELETE SET NULL,
  bom_id        uuid NOT NULL REFERENCES bom_headers(id) ON DELETE RESTRICT,
  po_number     text,                        -- nomor produksi internal (opsional)
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  planned_qty   numeric(12,4) NOT NULL,      -- qty yang akan diproduksi
  actual_qty    numeric(12,4),               -- qty yang benar-benar selesai (diisi saat complete)
  date          date NOT NULL,               -- tanggal rencana mulai
  notes         text,
  -- Cost snapshot saat produksi selesai
  total_material_cost numeric(12,2),         -- total biaya bahan yang dipakai
  hpp_per_unit        numeric(12,2),         -- total_material_cost / actual_qty
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- Snapshot material lines (rencana vs aktual)
CREATE TABLE IF NOT EXISTS production_order_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id   uuid NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  planned_qty           numeric(12,4) NOT NULL,   -- qty rencana dari BOM × planned_qty
  actual_qty            numeric(12,4),             -- qty aktual yang dipakai (diisi saat complete)
  unit_cost_snapshot    numeric(12,2),             -- avg_cost saat produksi selesai
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prodo_user_id_idx    ON production_orders (user_id);
CREATE INDEX IF NOT EXISTS prodo_store_id_idx   ON production_orders (store_id);
CREATE INDEX IF NOT EXISTS prodo_bom_id_idx     ON production_orders (bom_id);
CREATE INDEX IF NOT EXISTS prodo_status_idx     ON production_orders (user_id, status);
CREATE INDEX IF NOT EXISTS prodol_order_id_idx  ON production_order_lines (production_order_id);
CREATE INDEX IF NOT EXISTS prodol_item_id_idx   ON production_order_lines (item_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_production_order_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_order_updated_at_trigger
  BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION update_production_order_updated_at();

-- RLS: production_orders
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prodo: user sees own" ON production_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "prodo: user inserts own" ON production_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prodo: user updates own" ON production_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "prodo: user deletes draft own" ON production_orders
  FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

-- RLS: production_order_lines
ALTER TABLE production_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prodol: user sees own" ON production_order_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM production_orders
      WHERE production_orders.id = production_order_lines.production_order_id
        AND production_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "prodol: user inserts own" ON production_order_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM production_orders
      WHERE production_orders.id = production_order_lines.production_order_id
        AND production_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "prodol: user updates own" ON production_order_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM production_orders
      WHERE production_orders.id = production_order_lines.production_order_id
        AND production_orders.user_id = auth.uid()
    )
  );

CREATE POLICY "prodol: user deletes own" ON production_order_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM production_orders p
      WHERE p.id = production_order_lines.production_order_id
        AND p.user_id = auth.uid()
        AND p.status = 'draft'
    )
  );
