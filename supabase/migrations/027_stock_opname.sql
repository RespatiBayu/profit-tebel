-- Migration 027: Stock Opname (Stok Fisik)
-- Session opname = snapshot saldo sistem + hitungan fisik → auto-adjust selisih

CREATE TABLE IF NOT EXISTS stock_opname_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id     uuid REFERENCES stores(id) ON DELETE SET NULL,
  name         text NOT NULL,                -- cth: "Opname Mei 2026"
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'finalized')),
  date         date NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  finalized_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_opname_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  system_qty  numeric(12,4) NOT NULL DEFAULT 0,  -- snapshot saldo sistem saat opname dibuat
  actual_qty  numeric(12,4),                     -- hasil hitungan fisik (null = belum dihitung)
  notes       text,
  UNIQUE (session_id, item_id)
);

CREATE INDEX IF NOT EXISTS opname_sessions_user_idx ON stock_opname_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS opname_lines_session_idx ON stock_opname_lines (session_id);
CREATE INDEX IF NOT EXISTS opname_lines_item_idx    ON stock_opname_lines (item_id);

-- RLS
ALTER TABLE stock_opname_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_lines    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opname_sessions: user owns"
  ON stock_opname_sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "opname_lines: user owns via session"
  ON stock_opname_lines FOR ALL USING (
    EXISTS (
      SELECT 1 FROM stock_opname_sessions s
      WHERE s.id = stock_opname_lines.session_id
        AND s.user_id = auth.uid()
    )
  );
