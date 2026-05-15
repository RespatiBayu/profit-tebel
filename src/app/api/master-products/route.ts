import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { MasterProduct } from '@/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store')

  const productsQuery = supabase
    .from('master_products')
    .select('id, marketplace_product_id, product_name, hpp, packaging_cost, marketplace, category, notes')
    .order('product_name', { ascending: true })

  if (storeId) {
    productsQuery.eq('store_id', storeId)
  }

  const { data: products, error } = await productsQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const typedProducts = (products ?? []) as MasterProduct[]
  if (typedProducts.length === 0) {
    return NextResponse.json({ products: [] })
  }

  const productIds = typedProducts.map((product) => product.marketplace_product_id)
  const orderProductsQuery = supabase
    .from('order_products')
    .select('marketplace_product_id')
    .in('marketplace_product_id', productIds)
  const adsProductsQuery = supabase
    .from('ads_data')
    .select('product_code')
    .in('product_code', productIds)

  if (storeId) {
    orderProductsQuery.eq('store_id', storeId)
    adsProductsQuery.eq('store_id', storeId)
  }

  const [{ data: incomeIds }, { data: adsIds }] = await Promise.all([
    orderProductsQuery,
    adsProductsQuery,
  ])

  const incomeSet = new Set((incomeIds ?? []).map((row) => row.marketplace_product_id))
  const adsSet = new Set((adsIds ?? []).map((row) => row.product_code))

  return NextResponse.json({
    products: typedProducts.map((product) => ({
      ...product,
      has_income_data: incomeSet.has(product.marketplace_product_id),
      has_ads_data: adsSet.has(product.marketplace_product_id),
    })),
  })
}
