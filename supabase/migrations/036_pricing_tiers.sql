-- Migration 036: Pricing tiers Basic & Pro (lisensi tahunan) + free trial
-- Model baru:
--   'basic' → akses analitik + Master Item (HPP), tahunan (subscription_expires_at)
--   'pro'   → Basic + Inventori & Produksi full, tahunan
--   trial   → user baru dapat akses Basic gratis sampai trial_ends_at
-- Legacy tetap didukung: 'lifetime' (grandfather full), 'monthly' (≈ pro), 'free'.

-- 1) Perluas CHECK agar menerima 'basic' & 'pro'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_plan_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_plan_check
  CHECK (subscription_plan IN ('free', 'basic', 'pro', 'monthly', 'lifetime'));

-- 2) Kolom trial
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- 3) Grandfather + trial untuk user existing
--    - User yang sudah bayar (is_paid / lifetime / pro / monthly aktif) dibiarkan.
--    - User non-bayar (free/null) diberi trial 14 hari sejak migrasi agar tidak
--      langsung terkunci.
UPDATE profiles
SET trial_ends_at = now() + interval '14 days'
WHERE COALESCE(is_paid, false) = false
  AND (subscription_plan IS NULL OR subscription_plan = 'free')
  AND trial_ends_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_trial_idx
  ON profiles (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;
