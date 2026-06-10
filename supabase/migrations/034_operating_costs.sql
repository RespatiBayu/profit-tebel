-- Migration 034: Biaya Operasional (operating costs)
-- Seller input biaya rutin (listrik, sewa, gaji, internet, dll) per bulan.
-- Masuk ke perhitungan "Profit Bersih" di Dashboard Analisis.
-- Model: satu baris = satu biaya untuk satu periode (tahun + bulan).
-- store_id NULL = biaya berlaku untuk seluruh bisnis (bukan per toko).

CREATE TABLE IF NOT EXISTS operating_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id     uuid REFERENCES stores(id) ON DELETE SET NULL,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT 'other',  -- utilities/rent/salary/internet/marketing/transport/other
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  period_year  int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operating_costs_user_idx
  ON operating_costs (user_id);
CREATE INDEX IF NOT EXISTS operating_costs_period_idx
  ON operating_costs (user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS operating_costs_store_idx
  ON operating_costs (store_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_operating_costs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS operating_costs_updated_at_trigger ON operating_costs;
CREATE TRIGGER operating_costs_updated_at_trigger
  BEFORE UPDATE ON operating_costs
  FOR EACH ROW EXECUTE FUNCTION update_operating_costs_updated_at();

-- RLS: user hanya bisa akses biaya miliknya sendiri
ALTER TABLE operating_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operating_costs: user sees own" ON operating_costs;
CREATE POLICY "operating_costs: user sees own" ON operating_costs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating_costs: user inserts own" ON operating_costs;
CREATE POLICY "operating_costs: user inserts own" ON operating_costs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating_costs: user updates own" ON operating_costs;
CREATE POLICY "operating_costs: user updates own" ON operating_costs
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating_costs: user deletes own" ON operating_costs;
CREATE POLICY "operating_costs: user deletes own" ON operating_costs
  FOR DELETE USING (auth.uid() = user_id);
