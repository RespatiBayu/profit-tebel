-- Add has_set_password flag to profiles
-- false = user belum set password sendiri (dibuat via bulk import / admin)
-- true  = user sudah set password sendiri (bisa login normal)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_set_password boolean NOT NULL DEFAULT false;

-- Semua user yang sudah ada dianggap sudah set password
-- supaya tidak terganggu oleh perubahan flow login
UPDATE profiles SET has_set_password = true;
