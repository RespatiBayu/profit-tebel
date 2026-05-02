# Demo Account Setup Guide

## Option 1: Create Demo Account via UI (Recommended for quick testing)

1. Go to the login page: `http://localhost:3000/login`
2. Click **Daftar** (Register) tab
3. Enter demo credentials:
   - **Email:** `demo@profit-tebel.com`
   - **Password:** `Demo123456!` (min 8 characters)
4. Click "Daftar"
5. Verify email (if email verification is enabled)
6. Login with demo credentials

## Option 2: Create Demo Account via Supabase SQL (for development)

Run this SQL in Supabase SQL Editor:

```sql
-- Create demo user in auth.users (replace with actual values)
-- Note: This requires the Supabase service role key and should only be done in dev environment

-- First, insert into auth.users manually via Supabase dashboard:
-- 1. Go to Supabase > Authentication > Users
-- 2. Click "Invite"
-- 3. Enter email: demo@profit-tebel.com
-- OR use Supabase admin API

-- The profile will auto-create via trigger (003_auto_create_profile.sql)
```

## Demo Account Credentials

- **Email:** `demo@profit-tebel.com`
- **Password:** `Demo123456!`

## Create Sample Data for Demo Account

After creating the demo account, run this SQL to add sample data:

```sql
-- Get the user ID from profiles (replace YOUR_USER_ID)
WITH user_data AS (
  SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com' LIMIT 1
)

-- Create a store
INSERT INTO stores (user_id, name, marketplace, color)
SELECT id, 'Demo Store', 'shopee', '#3b82f6'
FROM user_data
ON CONFLICT (user_id, name, marketplace) DO NOTHING;

-- Get store ID
WITH store_data AS (
  SELECT id FROM stores 
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com')
  LIMIT 1
)

-- Add sample master products
INSERT INTO master_products (store_id, user_id, marketplace_product_id, product_name, hpp, packaging_cost, marketplace)
SELECT 
  s.id,
  (SELECT id FROM profiles WHERE email = 'demo@profit-tebel.com'),
  'demo-prod-' || generate_series,
  'Demo Product ' || generate_series,
  CASE 
    WHEN generate_series = 1 THEN 50000
    WHEN generate_series = 2 THEN 75000
    ELSE 100000
  END,
  2000,
  'shopee'
FROM store_data s,
generate_series(1, 5)
ON CONFLICT DO NOTHING;

-- Add sample orders (optional)
INSERT INTO upload_batches (user_id, store_id, file_name, file_type, marketplace, record_count, period_start, period_end)
SELECT 
  p.id,
  s.id,
  'demo_income_' || DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::text,
  'income',
  'shopee',
  10,
  DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date,
  (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day')::date
FROM profiles p
JOIN stores s ON s.user_id = p.id
WHERE p.email = 'demo@profit-tebel.com'
AND s.name = 'Demo Store';
```

## Alternative: Use Admin Email for Instant Access

Add your email to `ADMIN_EMAILS` environment variable in `.env.local`:

```env
ADMIN_EMAILS=your-email@example.com,another-email@example.com
```

Admin users get instant access without payment and can view all features.

## What's in the Demo Account?

- ✅ Sample master products with HPP data
- ✅ Demo store setup
- ✅ Ready to upload income/ads files for testing
- ✅ All dashboard features available

## Testing Workflows

### 1. Test Upload & Dashboard
1. Login as demo
2. Go to Upload section
3. Upload sample Shopee income file
4. View analytics in dashboard

### 2. Test Master Products
1. Go to Products section
2. View sample product list
3. Edit HPP values
4. See profit calculations update

### 3. Test ROAS Calculator
1. Go to ROAS Calculator
2. Create scenarios with demo data
3. See profit margin calculations

## Cleanup Demo Data

To remove demo account and all associated data:

```sql
DELETE FROM profiles WHERE email = 'demo@profit-tebel.com';
-- All related data (orders, products, etc.) will cascade delete
```
