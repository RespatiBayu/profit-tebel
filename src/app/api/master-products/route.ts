import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'
import type { MasterProduct, MasterProductSourceTag } from '@/types'

function parseNonNegativeNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

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
    .select('id, marketplace_product_id, seller_sku, numeric_id, source_tags, product_name, hpp, packaging_cost, marketplace, category, notes, linked_item_id, linked_item:items!linked_item_id(name)')
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
      linked_item_name: ((product as unknown as { linked_item?: { name: string }[] | null }).linked_item?.[0]?.name) ?? null,
    })),
  })
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      updates?: Array<{ id?: string; hpp?: number; packaging_cost?: number }>
    } | null

    if (!body?.updates || body.updates.length === 0) {
      return NextResponse.json({ error: 'Tidak ada perubahan untuk disimpan' }, { status: 400 })
    }

    const updatesById = new Map<string, { hpp: number; packaging_cost: number }>()

    for (const update of body.updates) {
      const id = update.id?.trim()
      const hpp = parseNonNegativeNumber(update.hpp)
      const packagingCost = parseNonNegativeNumber(update.packaging_cost)

      if (!id || hpp === null || packagingCost === null) {
        return NextResponse.json(
          { error: 'Format data HPP/Packaging tidak valid' },
          { status: 400 }
        )
      }

      updatesById.set(id, { hpp, packaging_cost: packagingCost })
    }

    const productIds = Array.from(updatesById.keys())
    const { data: products, error: productsError } = await supabase
      .from('master_products')
      .select('id,store_id')
      .in('id', productIds)

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 })
    }

    const typedProducts = (products ?? []) as Array<{ id: string; store_id: string | null }>
    if (typedProducts.length !== productIds.length) {
      return NextResponse.json(
        { error: 'Sebagian produk tidak ditemukan atau tidak bisa diakses' },
        { status: 404 }
      )
    }

    for (const product of typedProducts) {
      const update = updatesById.get(product.id)
      if (!update) continue

      const { error: updateError } = await supabase
        .from('master_products')
        .update({
          hpp: update.hpp,
          packaging_cost: update.packaging_cost,
        })
        .eq('id', product.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    const storeScopes = typedProducts.some((product) => !product.store_id)
      ? [null]
      : Array.from(new Set(typedProducts.map((product) => product.store_id)))

    const warnings = new Set<string>()
    for (const scope of storeScopes) {
      const result = await recalculateEstimatedHppForStore(supabase, scope)
      result.warnings.forEach((warning) => warnings.add(warning))
    }

    return NextResponse.json({
      success: true,
      updatedCount: typedProducts.length,
      recalculatedStores: storeScopes.length,
      warnings: Array.from(warnings),
    })
  } catch (error) {
    console.error('Bulk update master-products error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    )
  }
}
