-- Migration 006: Add ad_name and parent_iklan for campaign-level identity
-- Run AFTER 005_multi_store.sql in Supabase SQL Editor
--
-- Problem: Format 1 "Summary per Iklan" has one row PER CAMPAIGN (Nama Iklan).
-- Two campaigns for the same product (e.g. GMV Max ROAS + GMV Max Auto) were
-- incorrectly merged because the unique key was only (store_id, product_code, period).
--
-- Fix:
--   • Add ad_name  → stores "Nama Iklan" from Format 1 per-campaign CSV
--   • Add parent_iklan → stores "Parent Iklan" from Format 2 per-product CSV
--   • Replace the single unique constraint with two partial unique indexes:
--       - Format 1 rows (ad_name IS NOT NULL): unique per (store_id, ad_name, period)
--       - Format 2 rows (ad_name IS NULL):     unique per (store_id, product_code, period)

-- ============================================================
-- PART 1: Add new columns
-- ============================================================

ALTER TABLE ads_data
  ADD COLUMN IF NOT EXISTS ad_name     TEXT,
  ADD COLUMN IF NOT EXISTS parent_iklan TEXT;

-- ============================================================
-- PART 2: Backfill ad_name for existing Format 1 rows
-- (file_type = 'ads' in upload_batches → came from Summary per Iklan)
-- ============================================================

UPDATE ads_data a
SET ad_name = a.product_name
FROM upload_batches b
WHERE a.upload_batch_id = b.id
  AND b.file_type = 'ads'
  AND a.ad_name IS NULL;

-- ============================================================
-- PART 3: Drop the old single unique constraint
-- ============================================================

ALTER TABLE ads_data
  DROP CONSTRAINT IF EXISTS ads_data_store_product_period_unique;

-- ============================================================
-- PART 4: Create partial unique indexes
-- ============================================================

-- Format 1 campaigns: unique per store + campaign name + period
DROP INDEX IF EXISTS ads_data_format1_unique;
CREATE UNIQUE INDEX ads_data_format1_unique
  ON ads_data (store_id, ad_name, report_period_start, report_period_end)
  WHERE ad_name IS NOT NULL;

-- Format 2 per-product breakdown: unique per store + product_code + period
DROP INDEX IF EXISTS ads_data_format2_unique;
CREATE UNIQUE INDEX ads_data_format2_unique
  ON ads_data (store_id, product_code, report_period_start, report_period_end)
  WHERE ad_name IS NULL;

-- ============================================================
-- PART 5: Index for parent_iklan lookups (drill-down joins)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ads_data_parent_iklan
  ON ads_data (store_id, parent_iklan)
  WHERE parent_iklan IS NOT NULL;

-- ============================================================
-- Done. Verify with:
--   SELECT ad_name, product_code, report_period_start FROM ads_data LIMIT 20;
-- ============================================================
