-- Profit Tebel - Initial Schema
-- Run this in Supabase SQL Editor

-- Users table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_provider TEXT,
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master Products (user inputs HPP here)
CREATE TABLE master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  marketplace_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  hpp NUMERIC(12,2) DEFAULT 0,
  packaging_cost NUMERIC(12,2) DEFAULT 0,
  marketplace TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_product_id, marketplace)
);

-- Income/Order Data (parsed from XLSX)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  upload_batch_id UUID NOT NULL,
  marketplace TEXT NOT NULL,
  order_number TEXT NOT NULL,
  order_date DATE,
  release_date DATE,
  payment_method TEXT,
  original_price NUMERIC(12,2) DEFAULT 0,
  product_discount NUMERIC(12,2) DEFAULT 0,
  refund_amount NUMERIC(12,2) DEFAULT 0,
  seller_voucher NUMERIC(12,2) DEFAULT 0,
  seller_voucher_cofund NUMERIC(12,2) DEFAULT 0,
  seller_cashback NUMERIC(12,2) DEFAULT 0,
  buyer_shipping_fee NUMERIC(12,2) DEFAULT 0,
  shopee_shipping_subsidy NUMERIC(12,2) DEFAULT 0,
  actual_shipping_cost NUMERIC(12,2) DEFAULT 0,
  return_shipping_cost NUMERIC(12,2) DEFAULT 0,
  ams_commission NUMERIC(12,2) DEFAULT 0,
  admin_fee NUMERIC(12,2) DEFAULT 0,
  service_fee NUMERIC(12,2) DEFAULT 0,
  processing_fee NUMERIC(12,2) DEFAULT 0,
  premium_fee NUMERIC(12,2) DEFAULT 0,
  shipping_program_fee NUMERIC(12,2) DEFAULT 0,
  transaction_fee NUMERIC(12,2) DEFAULT 0,
  campaign_fee NUMERIC(12,2) DEFAULT 0,
  total_income NUMERIC(12,2) DEFAULT 0,
  voucher_code TEXT,
  shipping_type TEXT,
  courier_name TEXT,
  seller_free_shipping_promo NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order-Product Mapping (from Order Processing Fee sheet)
CREATE TABLE order_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  marketplace_product_id TEXT NOT NULL,
  product_name TEXT,
  processing_fee_prorata NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ads Data (parsed from CSV)
CREATE TABLE ads_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  upload_batch_id UUID NOT NULL,
  marketplace TEXT NOT NULL,
  product_name TEXT,
  product_code TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  direct_conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(8,4) DEFAULT 0,
  direct_conversion_rate NUMERIC(8,4) DEFAULT 0,
  cost_per_conversion NUMERIC(12,2) DEFAULT 0,
  cost_per_direct_conversion NUMERIC(12,2) DEFAULT 0,
  units_sold INTEGER DEFAULT 0,
  direct_units_sold INTEGER DEFAULT 0,
  gmv NUMERIC(14,2) DEFAULT 0,
  direct_gmv NUMERIC(14,2) DEFAULT 0,
  ad_spend NUMERIC(14,2) DEFAULT 0,
  roas NUMERIC(8,4) DEFAULT 0,
  direct_roas NUMERIC(8,4) DEFAULT 0,
  acos NUMERIC(8,4) DEFAULT 0,
  direct_acos NUMERIC(8,4) DEFAULT 0,
  voucher_amount NUMERIC(12,2) DEFAULT 0,
  vouchered_sales NUMERIC(14,2) DEFAULT 0,
  report_period_start DATE,
  report_period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upload history
CREATE TABLE upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  period_start DATE,
  period_end DATE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROAS Calculator saved scenarios
CREATE TABLE roas_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  selling_price NUMERIC(12,2),
  hpp NUMERIC(12,2),
  packaging_cost NUMERIC(12,2),
  commission_rate NUMERIC(6,4),
  admin_fee_rate NUMERIC(6,4),
  service_fee_rate NUMERIC(6,4),
  processing_fee NUMERIC(12,2),
  estimated_shipping NUMERIC(12,2),
  seller_voucher NUMERIC(12,2),
  target_roas NUMERIC(8,4),
  estimated_cr NUMERIC(6,4),
  estimated_cpc NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE roas_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users see own data" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users see own products" ON master_products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own orders" ON orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own order_products" ON order_products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own ads" ON ads_data FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own uploads" ON upload_batches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own scenarios" ON roas_scenarios FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_orders_user_date ON orders(user_id, order_date);
CREATE INDEX idx_orders_batch ON orders(upload_batch_id);
CREATE INDEX idx_order_products_order ON order_products(order_number);
CREATE INDEX idx_order_products_product ON order_products(marketplace_product_id);
CREATE INDEX idx_ads_user ON ads_data(user_id, product_code);
CREATE INDEX idx_master_products_user ON master_products(user_id, marketplace_product_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_products_updated_at BEFORE UPDATE ON master_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roas_scenarios_updated_at BEFORE UPDATE ON roas_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
