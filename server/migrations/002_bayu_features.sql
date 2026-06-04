CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  type TEXT NOT NULL CHECK (type IN ('raw_material', 'semi_finished', 'finished_good')),
  unit TEXT NOT NULL DEFAULT 'pcs',
  cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  packaging_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS items_user_id_idx ON items(user_id);
CREATE INDEX IF NOT EXISTS items_store_id_idx ON items(store_id);
CREATE INDEX IF NOT EXISTS items_type_idx ON items(user_id, type);

CREATE OR REPLACE FUNCTION update_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_updated_at_trigger ON items;
CREATE TRIGGER items_updated_at_trigger
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_items_updated_at();

CREATE TABLE IF NOT EXISTS bom_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  output_item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  output_qty NUMERIC(12,4) NOT NULL DEFAULT 1,
  name TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  input_item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_per_output NUMERIC(12,4) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS bom_lines_unique_item ON bom_lines(bom_id, input_item_id);
CREATE INDEX IF NOT EXISTS bom_headers_output_item_idx ON bom_headers(output_item_id);
CREATE INDEX IF NOT EXISTS bom_headers_user_id_idx ON bom_headers(user_id);
CREATE INDEX IF NOT EXISTS bom_lines_bom_id_idx ON bom_lines(bom_id);
CREATE INDEX IF NOT EXISTS bom_lines_input_item_idx ON bom_lines(input_item_id);

CREATE OR REPLACE FUNCTION update_bom_headers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bom_headers_updated_at_trigger ON bom_headers;
CREATE TRIGGER bom_headers_updated_at_trigger
  BEFORE UPDATE ON bom_headers
  FOR EACH ROW EXECUTE FUNCTION update_bom_headers_updated_at();

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  po_number TEXT,
  date DATE NOT NULL,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'received', 'cancelled')),
  notes TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_ordered NUMERIC(12,4) NOT NULL,
  qty_received NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS po_user_id_idx ON purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS po_store_id_idx ON purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS po_status_idx ON purchase_orders(user_id, status);
CREATE INDEX IF NOT EXISTS pol_po_id_idx ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS pol_item_id_idx ON purchase_order_lines(item_id);

CREATE OR REPLACE FUNCTION update_po_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_updated_at_trigger ON purchase_orders;
CREATE TRIGGER po_updated_at_trigger
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_po_updated_at();

CREATE OR REPLACE FUNCTION sync_po_total_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  UPDATE purchase_orders
  SET total_amount = (
    SELECT COALESCE(SUM(qty_ordered * unit_cost), 0)
    FROM purchase_order_lines
    WHERE po_id = v_po_id
  )
  WHERE id = v_po_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pol_sync_total_after_insert ON purchase_order_lines;
CREATE TRIGGER pol_sync_total_after_insert
  AFTER INSERT ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

DROP TRIGGER IF EXISTS pol_sync_total_after_update ON purchase_order_lines;
CREATE TRIGGER pol_sync_total_after_update
  AFTER UPDATE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

DROP TRIGGER IF EXISTS pol_sync_total_after_delete ON purchase_order_lines;
CREATE TRIGGER pol_sync_total_after_delete
  AFTER DELETE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'purchase_in',
    'production_in',
    'production_out',
    'sale_out',
    'adjustment'
  )),
  reference_id UUID,
  reference_type TEXT,
  qty NUMERIC(12,4) NOT NULL,
  unit_cost NUMERIC(12,2),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invtx_user_id_idx ON inventory_transactions(user_id);
CREATE INDEX IF NOT EXISTS invtx_store_id_idx ON inventory_transactions(store_id);
CREATE INDEX IF NOT EXISTS invtx_item_id_idx ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS invtx_type_idx ON inventory_transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS invtx_date_idx ON inventory_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS invtx_ref_idx ON inventory_transactions(reference_id) WHERE reference_id IS NOT NULL;

CREATE OR REPLACE VIEW item_stock AS
  SELECT
    user_id,
    store_id,
    item_id,
    SUM(qty)::numeric(12,4) AS qty_on_hand,
    CASE
      WHEN SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty ELSE 0 END) > 0
      THEN (
        SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty * unit_cost ELSE 0 END) /
        SUM(CASE WHEN qty > 0 AND unit_cost IS NOT NULL THEN qty ELSE 0 END)
      )::numeric(12,2)
      ELSE NULL
    END AS avg_cost,
    MAX(date) AS last_transaction_date,
    COUNT(*) AS transaction_count
  FROM inventory_transactions
  GROUP BY user_id, store_id, item_id;

CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  bom_id UUID NOT NULL REFERENCES bom_headers(id) ON DELETE RESTRICT,
  po_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  planned_qty NUMERIC(12,4) NOT NULL,
  actual_qty NUMERIC(12,4),
  date DATE NOT NULL,
  notes TEXT,
  total_material_cost NUMERIC(12,2),
  hpp_per_unit NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS production_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  planned_qty NUMERIC(12,4) NOT NULL,
  actual_qty NUMERIC(12,4),
  unit_cost_snapshot NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prodo_user_id_idx ON production_orders(user_id);
CREATE INDEX IF NOT EXISTS prodo_store_id_idx ON production_orders(store_id);
CREATE INDEX IF NOT EXISTS prodo_bom_id_idx ON production_orders(bom_id);
CREATE INDEX IF NOT EXISTS prodo_status_idx ON production_orders(user_id, status);
CREATE INDEX IF NOT EXISTS prodol_order_id_idx ON production_order_lines(production_order_id);
CREATE INDEX IF NOT EXISTS prodol_item_id_idx ON production_order_lines(item_id);

CREATE OR REPLACE FUNCTION update_production_order_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_order_updated_at_trigger ON production_orders;
CREATE TRIGGER production_order_updated_at_trigger
  BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION update_production_order_updated_at();

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT CHECK (subscription_plan IN ('free', 'monthly', 'lifetime')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_midtrans_order_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS has_set_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_subscription_idx
  ON profiles(subscription_plan, subscription_expires_at)
  WHERE subscription_plan IS NOT NULL;

CREATE OR REPLACE FUNCTION is_inventory_subscription_active(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE subscription_plan
          WHEN 'monthly' THEN subscription_expires_at IS NOT NULL AND subscription_expires_at > now()
          WHEN 'lifetime' THEN true
          ELSE false
        END
      FROM profiles
      WHERE id = uid
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION subscription_days_remaining(uid UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE subscription_plan
      WHEN 'monthly' THEN EXTRACT(DAY FROM (subscription_expires_at - now()))::integer
      ELSE NULL
    END
  FROM profiles
  WHERE id = uid;
$$;

UPDATE profiles
SET subscription_plan = 'lifetime'
WHERE is_paid = true
  AND subscription_plan IS NULL;

UPDATE profiles SET has_set_password = true WHERE has_set_password = false;
UPDATE profiles SET role = 'member' WHERE role = 'admin';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('superadmin', 'member'));

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS linked_item_id UUID REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS master_products_linked_item_idx
  ON master_products(linked_item_id)
  WHERE linked_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_transactions (
  merchant_ref TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lifetime', 'monthly')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refund')),
  provider TEXT NOT NULL DEFAULT 'ipaymu',
  provider_ref TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_idx
  ON payment_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_opname_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_opname_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  system_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(12,4),
  notes TEXT,
  UNIQUE(session_id, item_id)
);

CREATE INDEX IF NOT EXISTS opname_sessions_user_idx ON stock_opname_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS opname_lines_session_idx ON stock_opname_lines(session_id);
CREATE INDEX IF NOT EXISTS opname_lines_item_idx ON stock_opname_lines(item_id);
