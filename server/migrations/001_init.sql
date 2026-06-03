CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_provider TEXT,
  payment_id TEXT,
  lemonsqueezy_order_id TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin', 'admin', 'member')),
  created_by_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, marketplace)
);

CREATE TABLE IF NOT EXISTS store_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE TABLE IF NOT EXISTS master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  marketplace_product_id TEXT NOT NULL,
  seller_sku TEXT,
  numeric_id TEXT,
  source_tags TEXT[] NOT NULL DEFAULT '{}',
  product_name TEXT NOT NULL,
  hpp NUMERIC(12,2) DEFAULT 0,
  packaging_cost NUMERIC(12,2) DEFAULT 0,
  marketplace TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT master_products_store_product_unique UNIQUE (store_id, marketplace_product_id)
);

CREATE TABLE IF NOT EXISTS upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  period_start DATE,
  period_end DATE,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  upload_batch_id UUID NOT NULL,
  marketplace TEXT NOT NULL,
  order_number TEXT NOT NULL,
  buyer_username TEXT,
  buyer_name TEXT,
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
  status TEXT,
  estimated_hpp NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT orders_store_order_unique UNIQUE (store_id, order_number)
);

CREATE TABLE IF NOT EXISTS order_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  marketplace_product_id TEXT NOT NULL,
  product_name TEXT,
  processing_fee_prorata NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT order_products_store_order_product_unique UNIQUE (store_id, order_number, marketplace_product_id)
);

CREATE TABLE IF NOT EXISTS ads_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  upload_batch_id UUID NOT NULL,
  marketplace TEXT NOT NULL,
  ad_name TEXT,
  parent_iklan TEXT,
  ad_status TEXT,
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
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ads_data_format1_unique
  ON ads_data (store_id, ad_name, report_period_start, report_period_end)
  WHERE ad_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ads_data_format2_unique
  ON ads_data (store_id, product_code, report_period_start, report_period_end)
  WHERE ad_name IS NULL;

CREATE TABLE IF NOT EXISTS orders_all (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  upload_batch_id UUID REFERENCES upload_batches(id),
  marketplace TEXT NOT NULL DEFAULT 'shopee',
  order_number TEXT NOT NULL,
  status_pesanan TEXT,
  total_pembayaran NUMERIC(12,2) DEFAULT 0,
  seller_voucher NUMERIC(12,2) DEFAULT 0,
  order_date DATE,
  order_complete_date DATE,
  products_json JSONB DEFAULT '[]'::jsonb,
  estimated_hpp NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT orders_all_store_order_unique UNIQUE (store_id, order_number)
);

CREATE TABLE IF NOT EXISTS roas_scenarios (
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  resolved_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  user_email TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('income', 'ads', 'ads_product', 'orders_all')),
  marketplace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  progress_label TEXT,
  payload_base64 TEXT NOT NULL,
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_store_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO store_memberships (store_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'owner')
    ON CONFLICT (store_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_auth_users_updated_at ON auth_users;
CREATE TRIGGER update_auth_users_updated_at BEFORE UPDATE ON auth_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stores_updated_at ON stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_master_products_updated_at ON master_products;
CREATE TRIGGER update_master_products_updated_at BEFORE UPDATE ON master_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_roas_scenarios_updated_at ON roas_scenarios;
CREATE TRIGGER update_roas_scenarios_updated_at BEFORE UPDATE ON roas_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_upload_jobs_updated_at ON upload_jobs;
CREATE TRIGGER update_upload_jobs_updated_at BEFORE UPDATE ON upload_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS on_store_created_add_owner_membership ON stores;
CREATE TRIGGER on_store_created_add_owner_membership
  AFTER INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION ensure_store_owner_membership();

CREATE INDEX IF NOT EXISTS idx_profiles_lemonsqueezy_order_id ON profiles (lemonsqueezy_order_id) WHERE lemonsqueezy_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_created_by_id ON profiles(created_by_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_store_memberships_user ON store_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_store_memberships_store ON store_memberships(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_date ON orders(user_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_batch ON orders(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_order_products_order ON order_products(order_number);
CREATE INDEX IF NOT EXISTS idx_order_products_product ON order_products(marketplace_product_id);
CREATE INDEX IF NOT EXISTS idx_order_products_store ON order_products(store_id);
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads_data(user_id, product_code);
CREATE INDEX IF NOT EXISTS idx_ads_data_store ON ads_data(store_id);
CREATE INDEX IF NOT EXISTS idx_ads_data_parent_iklan ON ads_data(store_id, parent_iklan) WHERE parent_iklan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_batches_store ON upload_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_master_products_user ON master_products(user_id, marketplace_product_id);
CREATE INDEX IF NOT EXISTS idx_master_products_store ON master_products(store_id);
CREATE INDEX IF NOT EXISTS idx_master_products_numeric_id ON master_products(user_id, numeric_id) WHERE numeric_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_master_products_store_seller_sku ON master_products(store_id, seller_sku) WHERE seller_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_created ON upload_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status_created ON upload_jobs(status, created_at ASC);
