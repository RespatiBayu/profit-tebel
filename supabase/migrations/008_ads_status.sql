-- Migration 008: Add ad_status column to ads_data
--
-- Status kolom dari Shopee CSV: "Berjalan", "Dijeda", "Berakhir" — berguna
-- biar user bisa bedain campaign yang masih aktif vs yang udah paused/ended
-- di Traffic Light table.

ALTER TABLE ads_data
  ADD COLUMN IF NOT EXISTS ad_status TEXT;

COMMENT ON COLUMN ads_data.ad_status IS
  'Status iklan dari Shopee: Berjalan | Dijeda | Berakhir. Nullable karena row lama & Format 2 (GMV Max Detail Produk) tidak punya field ini.';
