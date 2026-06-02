-- Migration 026: Payment Transactions (Tripay)
-- Tripay tidak punya custom_field seperti Midtrans, jadi kita simpan mapping
-- merchant_ref -> user_id + type di tabel ini. Webhook callback resolve user
-- via tabel ini (reliable, bukan nebak prefix UUID). Sekaligus jadi riwayat
-- pembayaran.

CREATE TABLE IF NOT EXISTS payment_transactions (
  merchant_ref   text PRIMARY KEY,                 -- PT-xxxx / PTS-xxxx (kunci dari kita)
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('lifetime', 'monthly')),
  amount         integer NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refund')),
  provider       text NOT NULL DEFAULT 'tripay',
  provider_ref   text,                             -- reference dari Tripay
  checkout_url   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_idx
  ON payment_transactions (user_id, created_at DESC);

-- RLS: user hanya bisa lihat transaksinya sendiri. Insert/update dilakukan
-- via service role (route handler & webhook) yang bypass RLS.
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON payment_transactions;
CREATE POLICY "Users can view own transactions"
  ON payment_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Kolom referensi pembayaran terakhir (generic, gantikan subscription_midtrans_order_id).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_payment_ref text;
