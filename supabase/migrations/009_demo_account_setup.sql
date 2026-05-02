-- Demo Account Setup Script for Profit Tebel
-- Run this in Supabase SQL Editor after creating a demo user via auth
-- Replace 'demo@profit-tebel.com' with actual demo email if different

-- ============================================================
-- PART 1: Get demo user ID
-- ============================================================
-- You must create the auth user first via Supabase dashboard or API
-- After creation, the profile will auto-create via trigger

-- ============================================================
-- PART 2: Create demo store
-- ============================================================
INSERT INTO stores (user_id, name, marketplace, color, notes)
SELECT 
  id,
  'Demo Store',
  'shopee',
  '#3b82f6',
  'Demo store for testing and development'
FROM profiles
WHERE email = 'demo@profit-tebel.com'
ON CONFLICT (user_id, name, marketplace) DO NOTHING;

-- ============================================================
-- PART 3: Add sample master products
-- ============================================================
WITH demo_store AS (
  SELECT s.id as store_id, p.id as user_id
  FROM stores s
  JOIN profiles p ON s.user_id = p.id
  WHERE p.email = 'demo@profit-tebel.com' AND s.name = 'Demo Store'
)
INSERT INTO master_products (
  store_id, user_id, marketplace_product_id, product_name, 
  hpp, packaging_cost, marketplace, category
)
SELECT 
  ds.store_id,
  ds.user_id,
  'DEMO-' || LPAD(i::text, 3, '0'),
  CASE i
    WHEN 1 THEN 'Demo T-Shirt Premium'
    WHEN 2 THEN 'Demo Sneakers Classic'
    WHEN 3 THEN 'Demo Backpack Travel'
    WHEN 4 THEN 'Demo Phone Case Leather'
    WHEN 5 THEN 'Demo Wallet Slim'
  END,
  CASE i
    WHEN 1 THEN 50000
    WHEN 2 THEN 150000
    WHEN 3 THEN 200000
    WHEN 4 THEN 30000
    WHEN 5 THEN 40000
  END,
  CASE i
    WHEN 1 THEN 2000
    WHEN 2 THEN 5000
    WHEN 3 THEN 10000
    WHEN 4 THEN 1000
    WHEN 5 THEN 1500
  END,
  'shopee',
  CASE i
    WHEN 1 THEN 'Fashion'
    WHEN 2 THEN 'Shoes'
    WHEN 3 THEN 'Bags'
    WHEN 4 THEN 'Accessories'
    WHEN 5 THEN 'Accessories'
  END
FROM demo_store ds, 
generate_series(1, 5) as i
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 4: Create sample upload batch (reference only)
-- ============================================================
WITH demo_store AS (
  SELECT s.id as store_id, p.id as user_id
  FROM stores s
  JOIN profiles p ON s.user_id = p.id
  WHERE p.email = 'demo@profit-tebel.com' AND s.name = 'Demo Store'
)
INSERT INTO upload_batches (
  user_id, store_id, file_name, file_type, marketplace, 
  record_count, period_start, period_end
)
SELECT 
  ds.user_id,
  ds.store_id,
  'demo_income_sample.xlsx',
  'income',
  'shopee',
  0,  -- Will be updated when actual file is uploaded
  DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date,
  (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day')::date
FROM demo_store ds
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 5: Add sample ROAS calculation scenario
-- ============================================================
WITH demo_user AS (
  SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com'
)
INSERT INTO roas_scenarios (
  user_id, scenario_name, marketplace, selling_price, hpp, 
  packaging_cost, commission_rate, admin_fee_rate, service_fee_rate,
  processing_fee, estimated_shipping, seller_voucher, target_roas
)
SELECT 
  du.id,
  'Demo Scenario - Optimal Profit',
  'shopee',
  150000,  -- selling price
  50000,   -- hpp
  2000,    -- packaging
  0.05,    -- 5% commission
  0.02,    -- 2% admin fee
  0.03,    -- 3% service fee
  2500,    -- processing fee
  15000,   -- estimated shipping
  5000,    -- seller voucher
  3.0      -- target ROAS 3.0x
FROM demo_user du
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Uncomment to verify setup:

-- SELECT 'Profiles' as table_name, COUNT(*) as count FROM profiles WHERE email = 'demo@profit-tebel.com'
-- UNION ALL
-- SELECT 'Stores', COUNT(*) FROM stores WHERE user_id = (SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com')
-- UNION ALL
-- SELECT 'Master Products', COUNT(*) FROM master_products WHERE user_id = (SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com')
-- UNION ALL
-- SELECT 'ROAS Scenarios', COUNT(*) FROM roas_scenarios WHERE user_id = (SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com');

-- ============================================================
-- Done! Your demo account is ready for testing.
-- Login with: demo@profit-tebel.com (and the password you set)
-- ============================================================
