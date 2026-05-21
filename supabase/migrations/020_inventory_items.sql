-- Migration 020: Master Items (Bahan Mentah, Setengah Jadi, Barang Jadi)
-- Used by Inventory / BOM / Production modules (subscription-gated)

CREATE TABLE IF NOT EXISTS items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE SET NULL,
  name            text NOT NULL,
  sku             text,
  type            text NOT NULL CHECK (type IN ('raw_material', 'semi_finished', 'finished_good')),
  unit            text NOT NULL DEFAULT 'pcs',   -- pcs, kg, gram, liter, ml, lusin, dll
  cost_per_unit   numeric(12,2) NOT NULL DEFAULT 0,  -- harga manual / fallback jika belum ada PO
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index untuk lookup cepat
CREATE INDEX IF NOT EXISTS items_user_id_idx    ON items (user_id);
CREATE INDEX IF NOT EXISTS items_store_id_idx   ON items (store_id);
CREATE INDEX IF NOT EXISTS items_type_idx       ON items (user_id, type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_updated_at_trigger
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_items_updated_at();

-- RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items: user sees own" ON items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "items: user inserts own" ON items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items: user updates own" ON items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "items: user deletes own" ON items
  FOR DELETE USING (auth.uid() = user_id);
