import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'
import type { MasterProduct, MasterProductSourceTag } from '@/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store')
  const marketplace = normalizeMarketplaceFilter(searchParams.get('marketplace'))

  const productsQuery = supabase
    .from('master_products')
    .select('id, marketplace_product_id, seller_sku, numeric_id, source_tags, product_name, hpp, packaging_cost, marketplace, category, notes')
    .order('product_name', { ascending: true })

  if (storeId) {
    productsQuery.eq('store_id', storeId)
  }
  if (marketplace) {
    productsQuery.eq('marketplace', marketplace)
  }

  const { data: products, error } = await productsQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type ProductRow = MasterProduct & { numeric_id?: string | null; source_tags?: MasterProductSourceTag[] | null }
  const typedProducts = (products ?? []) as ProductRow[]
  if (typedProducts.length === 0) {
    return NextResponse.json({ products: [] })
  }

  const orderProductsQuery = supabase
    .from('order_products')
    .select('marketplace_product_id')
  const adsProductsQuery = supabase
    .from('ads_data')
    .select('product_code, ad_name')

  if (storeId) {
    orderProductsQuery.eq('store_id', storeId)
    adsProductsQuery.eq('store_id', storeId)
  }
  if (marketplace) {
    adsProductsQuery.eq('marketplace', marketplace)
  }

  const [{ data: incomeIds }, { data: adsRows }] = await Promise.all([
    orderProductsQuery,
    adsProductsQuery,
  ])

  const incomeSet = new Set((incomeIds ?? []).map((row) => row.marketplace_product_id))
  const adsSet = new Set(
    (adsRows ?? [])
      .filter((row) => row.ad_name !== null)
      .map((row) => row.product_code)
  )
  const adsProductSet = new Set(
    (adsRows ?? [])
      .filter((row) => row.ad_name === null)
      .map((row) => row.product_code)
  )

  const orderedSourceTags: MasterProductSourceTag[] = ['income', 'orders_all', 'ads', 'ads_product']

  return NextResponse.json({
    products: typedProducts.map((product) => ({
      ...product,
      source_tags: orderedSourceTags.filter((tag) => {
        if ((product.source_tags ?? []).includes(tag)) return true
        if (tag === 'orders_all') return !!product.seller_sku
        if (tag === 'income') {
          if (!product.numeric_id && !(product.source_tags ?? []).includes('income')) return false
          return (
            incomeSet.has(product.marketplace_product_id) ||
            (!!product.seller_sku && incomeSet.has(product.seller_sku))
          )
        }
        if (tag === 'ads') return adsSet.has(product.marketplace_product_id)
        if (tag === 'ads_product') return adsProductSet.has(product.marketplace_product_id)
        return false
      }),
      has_income_data:
        incomeSet.has(product.marketplace_product_id) ||
        (!!product.seller_sku && incomeSet.has(product.seller_sku)),
      has_ads_data: adsSet.has(product.marketplace_product_id),
    })),
  })
}
