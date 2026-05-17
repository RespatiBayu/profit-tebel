-- Canonicalize Shopee product identity around the numeric product_id used by
-- Income Seller Fee and Ads "kode produk", while preserving seller SKU as an
-- optional bridge for Order.all.

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS seller_sku TEXT;

-- Preserve legacy SKU-keyed masters in seller_sku before promoting the
-- canonical key to the numeric product ID.
UPDATE master_products
SET seller_sku = marketplace_product_id
WHERE seller_sku IS NULL
  AND marketplace_product_id !~ '^[0-9]+$';

-- Promote canonical IDs to numeric product IDs when we already know the
-- numeric mapping and no conflicting canonical row exists for the store.
UPDATE master_products AS mp
SET marketplace_product_id = mp.numeric_id
WHERE mp.numeric_id IS NOT NULL
  AND mp.numeric_id <> ''
  AND mp.marketplace_product_id <> mp.numeric_id
  AND NOT EXISTS (
    SELECT 1
    FROM master_products AS other
    WHERE other.store_id = mp.store_id
      AND other.marketplace_product_id = mp.numeric_id
      AND other.id <> mp.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_master_products_store_seller_sku
  ON master_products(store_id, seller_sku)
  WHERE seller_sku IS NOT NULL;
