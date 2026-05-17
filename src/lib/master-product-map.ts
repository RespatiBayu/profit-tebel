import type { MasterProduct } from '@/types'

export function buildMasterProductMap(masterProducts: MasterProduct[]): Map<string, MasterProduct> {
  const map = new Map<string, MasterProduct>()

  for (const product of masterProducts) {
    if (product.marketplace_product_id) {
      map.set(product.marketplace_product_id, product)
    }
    if (product.seller_sku) {
      map.set(product.seller_sku, product)
    }
  }

  return map
}
