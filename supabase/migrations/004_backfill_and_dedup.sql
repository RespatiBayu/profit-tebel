-- Migration 004: Backfill profiles & add dedup constraints
-- Run this in Supabase SQL Editor AFTER 003_auto_create_profile.sql

-- ============================================================
-- PART 1: Backfill profiles for existing auth.users
-- (Trigger 003 only fires for NEW signups; existing users need this)
-- ============================================================
INSERT INTO public.profiles (id, email, full_name, is_paid)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  false
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PART 2: Remove existing duplicates before adding unique keys
-- Keep the OLDEST row for each natural key (lowest created_at)
-- ============================================================

-- Orders: natural key = (user_id, marketplace, order_number)
DELETE FROM orders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, marketplace, order_number
        ORDER BY created_at ASC
      ) AS rn
    FROM orders
  ) sub
  WHERE rn > 1
);

-- Order Products: natural key = (user_id, order_number, marketplace_product_id)
DELETE FROM order_products
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, order_number, marketplace_product_id
        ORDER BY created_at ASC
      ) AS rn
    FROM order_products
  ) sub
  WHERE rn > 1
);

-- Ads Data: natural key = (user_id, marketplace, product_code, report_period_start, report_period_end)
DELETE FROM ads_data
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, marketplace, product_code, report_period_start, report_period_end
        ORDER BY created_at ASC
      ) AS rn
    FROM ads_data
  ) sub
  WHERE rn > 1
);

-- ============================================================
-- PART 3: Add unique constraints for future dedup via UPSERT
-- ============================================================

-- Orders
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_user_marketplace_order_unique;
ALTER TABLE orders
  ADD CONSTRAINT orders_user_marketplace_order_unique
  UNIQUE (user_id, marketplace, order_number);

-- Order Products
ALTER TABLE order_products
  DROP CONSTRAINT IF EXISTS order_products_user_order_product_unique;
ALTER TABLE order_products
  ADD CONSTRAINT order_products_user_order_product_unique
  UNIQUE (user_id, order_number, marketplace_product_id);

-- Ads Data
ALTER TABLE ads_data
  DROP CONSTRAINT IF EXISTS ads_data_user_product_period_unique;
ALTER TABLE ads_data
  ADD CONSTRAINT ads_data_user_product_period_unique
  UNIQUE (user_id, marketplace, product_code, report_period_start, report_period_end);

-- ============================================================
-- Done. Verify with:
--   SELECT COUNT(*) FROM auth.users;   -- should match profiles
--   SELECT COUNT(*) FROM public.profiles;
-- ============================================================
