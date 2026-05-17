ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS source_tags TEXT[] NOT NULL DEFAULT '{}';

UPDATE master_products
SET source_tags = array_append(source_tags, 'orders_all')
WHERE seller_sku IS NOT NULL
  AND NOT ('orders_all' = ANY(source_tags));

UPDATE master_products
SET source_tags = array_append(source_tags, 'income')
WHERE numeric_id IS NOT NULL
  AND NOT ('income' = ANY(source_tags));

UPDATE master_products AS mp
SET source_tags = array_append(mp.source_tags, 'ads')
WHERE EXISTS (
  SELECT 1
  FROM ads_data AS ad
  WHERE ad.store_id = mp.store_id
    AND ad.product_code = mp.marketplace_product_id
)
  AND NOT ('ads' = ANY(mp.source_tags));

UPDATE master_products AS mp
SET source_tags = array_append(mp.source_tags, 'ads_product')
WHERE EXISTS (
  SELECT 1
  FROM ads_data AS ad
  WHERE ad.store_id = mp.store_id
    AND ad.product_code = mp.marketplace_product_id
    AND ad.ad_name IS NULL
)
  AND NOT ('ads_product' = ANY(mp.source_tags));
