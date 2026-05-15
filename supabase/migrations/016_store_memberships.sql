-- Migration 016: store memberships + store-scoped access control

CREATE TABLE IF NOT EXISTS store_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_memberships_user ON store_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_store_memberships_store ON store_memberships(store_id);

ALTER TABLE store_memberships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_store(target_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_memberships sm
    WHERE sm.store_id = target_store_id
      AND sm.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_store(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_store_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.store_memberships (store_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'owner')
    ON CONFLICT (store_id, user_id) DO UPDATE
    SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_store_created_add_owner_membership ON stores;

CREATE TRIGGER on_store_created_add_owner_membership
  AFTER INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION public.ensure_store_owner_membership();

INSERT INTO store_memberships (store_id, user_id, role)
SELECT id, user_id, 'owner'
FROM stores
WHERE user_id IS NOT NULL
ON CONFLICT (store_id, user_id) DO UPDATE
SET role = 'owner';

DROP POLICY IF EXISTS "Users see own stores" ON stores;
DROP POLICY IF EXISTS "Users can view accessible stores" ON stores;
DROP POLICY IF EXISTS "Store owners can create stores" ON stores;
DROP POLICY IF EXISTS "Store owners can update stores" ON stores;
DROP POLICY IF EXISTS "Store owners can delete stores" ON stores;

CREATE POLICY "Users can view accessible stores" ON stores
  FOR SELECT USING (public.user_can_access_store(id));

CREATE POLICY "Store owners can create stores" ON stores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Store owners can update stores" ON stores
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Store owners can delete stores" ON stores
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own memberships" ON store_memberships;

CREATE POLICY "Users can view own memberships" ON store_memberships
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own products" ON master_products;
DROP POLICY IF EXISTS "Users see own orders" ON orders;
DROP POLICY IF EXISTS "Users see own order_products" ON order_products;
DROP POLICY IF EXISTS "Users see own ads" ON ads_data;
DROP POLICY IF EXISTS "Users see own uploads" ON upload_batches;
DROP POLICY IF EXISTS "users_see_own_orders_all" ON orders_all;

CREATE POLICY "Users access store master_products" ON master_products
  FOR ALL
  USING (store_id IS NOT NULL AND public.user_can_access_store(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.user_can_access_store(store_id));

CREATE POLICY "Users access store orders" ON orders
  FOR ALL
  USING (store_id IS NOT NULL AND public.user_can_access_store(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.user_can_access_store(store_id));

CREATE POLICY "Users access store order_products" ON order_products
  FOR ALL
  USING (store_id IS NOT NULL AND public.user_can_access_store(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.user_can_access_store(store_id));

CREATE POLICY "Users access store ads_data" ON ads_data
  FOR ALL
  USING (store_id IS NOT NULL AND public.user_can_access_store(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.user_can_access_store(store_id));

CREATE POLICY "Users access store upload_batches" ON upload_batches
  FOR ALL
  USING (store_id IS NOT NULL AND public.user_can_access_store(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.user_can_access_store(store_id));

CREATE POLICY "Users access store orders_all" ON orders_all
  FOR ALL
  USING (public.user_can_access_store(store_id))
  WITH CHECK (public.user_can_access_store(store_id));
