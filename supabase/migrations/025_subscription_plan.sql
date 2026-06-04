-- Migration 025: Subscription Plan
-- Menambah kolom subscription_plan & subscription_expires_at ke profiles
-- subscription_plan:
--   NULL / 'free'    → one-time purchase user (fitur existing + HPP manual)
--   'monthly'        → subscriber bulanan (+ Pembelian, Inventori, Produksi, BOM, HPP auto)
--   'lifetime'       → one-time lifetime (sama seperti monthly, tidak expire)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_plan        text
    CHECK (subscription_plan IN ('free', 'monthly', 'lifetime')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_midtrans_order_id text;  -- tracking pembayaran terakhir

-- Index untuk query subscription aktif
CREATE INDEX IF NOT EXISTS profiles_subscription_idx
  ON profiles (subscription_plan, subscription_expires_at)
  WHERE subscription_plan IS NOT NULL;

-- Helper function: apakah user aktif subscription inventory?
-- Dipakai di server-side untuk gate akses fitur inventory
CREATE OR REPLACE FUNCTION is_inventory_subscription_active(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE subscription_plan
          WHEN 'monthly'  THEN subscription_expires_at IS NOT NULL AND subscription_expires_at > now()
          WHEN 'lifetime' THEN true
          ELSE false
        END
      FROM profiles
      WHERE id = uid
    ),
    false
  );
$$;

-- Helper function: berapa hari tersisa subscription?
-- Negatif = sudah expired. NULL = bukan monthly/tidak ada expiry.
CREATE OR REPLACE FUNCTION subscription_days_remaining(uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    CASE subscription_plan
      WHEN 'monthly' THEN
        EXTRACT(DAY FROM (subscription_expires_at - now()))::integer
      ELSE NULL
    END
  FROM profiles
  WHERE id = uid;
$$;

-- Update roles.ts getCurrentUserAccess juga memperhitungkan subscription
-- (dilakukan di kode TypeScript, bukan di SQL)

-- Backfill: user yang is_paid = true dan belum punya subscription_plan
-- → set ke 'lifetime' (existing paid users tetap dapat akses fitur lama)
UPDATE profiles
SET subscription_plan = 'lifetime'
WHERE is_paid = true
  AND subscription_plan IS NULL;
