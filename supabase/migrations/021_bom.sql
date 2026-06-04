-- Migration 021: Bill of Materials (BOM)
-- Mendukung multi-level BOM: semi_finished bisa jadi input BOM barang jadi

CREATE TABLE IF NOT EXISTS bom_headers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE SET NULL,
  output_item_id  uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  output_qty      numeric(12,4) NOT NULL DEFAULT 1,   -- qty output per 1x proses produksi
  name            text,                                -- opsional, default pakai nama item
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          uuid NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  input_item_id   uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_per_output  numeric(12,4) NOT NULL,              -- qty input yang dibutuhkan per 1x output
  sort_order      int NOT NULL DEFAULT 0,
  notes           text
);

-- Constraint: 1 item hanya boleh muncul sekali per BOM
CREATE UNIQUE INDEX IF NOT EXISTS bom_lines_unique_item
  ON bom_lines (bom_id, input_item_id);

-- Constraint: output_item tidak boleh sama dengan input_item di BOM yang sama
-- (cycle langsung), cycle multi-level dicek di aplikasi
CREATE INDEX IF NOT EXISTS bom_headers_output_item_idx ON bom_headers (output_item_id);
CREATE INDEX IF NOT EXISTS bom_headers_user_id_idx     ON bom_headers (user_id);
CREATE INDEX IF NOT EXISTS bom_lines_bom_id_idx        ON bom_lines (bom_id);
CREATE INDEX IF NOT EXISTS bom_lines_input_item_idx    ON bom_lines (input_item_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_bom_headers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bom_headers_updated_at_trigger
  BEFORE UPDATE ON bom_headers
  FOR EACH ROW EXECUTE FUNCTION update_bom_headers_updated_at();

-- RLS: bom_headers
ALTER TABLE bom_headers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bom_headers: user sees own" ON bom_headers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bom_headers: user inserts own" ON bom_headers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bom_headers: user updates own" ON bom_headers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "bom_headers: user deletes own" ON bom_headers
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: bom_lines (akses via join ke bom_headers)
ALTER TABLE bom_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bom_lines: user sees own" ON bom_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bom_headers
      WHERE bom_headers.id = bom_lines.bom_id
        AND bom_headers.user_id = auth.uid()
    )
  );

CREATE POLICY "bom_lines: user inserts own" ON bom_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM bom_headers
      WHERE bom_headers.id = bom_lines.bom_id
        AND bom_headers.user_id = auth.uid()
    )
  );

CREATE POLICY "bom_lines: user updates own" ON bom_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM bom_headers
      WHERE bom_headers.id = bom_lines.bom_id
        AND bom_headers.user_id = auth.uid()
    )
  );

CREATE POLICY "bom_lines: user deletes own" ON bom_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM bom_headers
      WHERE bom_headers.id = bom_lines.bom_id
        AND bom_headers.user_id = auth.uid()
    )
  );
