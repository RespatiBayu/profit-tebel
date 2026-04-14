-- Add Lemonsqueezy order ID to profiles for webhook idempotency
-- Run this in Supabase SQL Editor after 001_initial_schema.sql
-- (is_paid and paid_at are already in 001_initial_schema.sql)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lemonsqueezy_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_lemonsqueezy_order_id
  ON profiles (lemonsqueezy_order_id)
  WHERE lemonsqueezy_order_id IS NOT NULL;
