-- Migration 035: Tanggal biaya operasional
-- User bisa pilih tanggal kapan biaya dikeluarkan. period_year/period_month
-- tetap ada untuk agregasi bulanan di dashboard, diturunkan dari cost_date.

ALTER TABLE operating_costs
  ADD COLUMN IF NOT EXISTS cost_date date;

-- Backfill baris lama: pakai tanggal 1 dari periodenya.
UPDATE operating_costs
SET cost_date = make_date(period_year, period_month, 1)
WHERE cost_date IS NULL;

CREATE INDEX IF NOT EXISTS operating_costs_cost_date_idx
  ON operating_costs (user_id, cost_date);
