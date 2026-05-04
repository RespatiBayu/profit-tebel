import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * Diagnostic endpoint for HPP calculation issues.
 * GET /api/debug/hpp-trace[?store=<id>][&order=<order_number>]
 *
 * Returns a comprehensive trace of why HPP might be 0 for the user's orders:
 *   - Does `orders` table have estimated_hpp column? (migration 013)
 *   - Does `orders_all` table have estimated_hpp column? (migration 012)
 *   - Per-order: estimated_hpp value, order_products linkage, master_products HPP
 *   - Master products with their HPP
 *   - Mismatched product IDs (in order_products but not master_products, or vice versa)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const storeFilter = searchParams.get('store')
  const orderFilter = searchParams.get('order')

  const serviceClient = await createServiceClient()

  // --- Migration check: try to select estimated_hpp from each table ---
  const migrationCheck = {
    orders_estimated_hpp_exists: false,
    orders_all_estimated_hpp_exists: false,
  }
  {
    const probe = await serviceClient
      .from('orders')
      .select('estimated_hpp')
      .eq('user_id', user.id)
      .limit(1)
    migrationCheck.orders_estimated_hpp_exists = !probe.error
  }
  {
    const probe = await serviceClient
      .from('orders_all')
      .select('estimated_hpp')
      .eq('user_id', user.id)
      .limit(1)
    migrationCheck.orders_all_estimated_hpp_exists = !probe.error
  }

  // --- Fetch orders ---
  const ordersQ = serviceClient
    .from('orders')
    .select('id,order_number,store_id,order_date,original_price,total_income' +
      (migrationCheck.orders_estimated_hpp_exists ? ',estimated_hpp' : ''))
    .eq('user_id', user.id)
    .order('order_date', { ascending: false })
    .limit(50)
  if (storeFilter) ordersQ.eq('store_id', storeFilter)
  if (orderFilter) ordersQ.eq('order_number', orderFilter)
  const { data: orders, error: ordersErr } = await ordersQ

  if (ordersErr) {
    return NextResponse.json({ error: 'orders query failed', detail: ordersErr.message }, { status: 500 })
  }

  const ordersTyped = (orders ?? []) as unknown as Array<{
    order_number: string
    estimated_hpp?: number | null
    original_price: number
    total_income: number
    order_date: string | null
  }>
  const orderNumbers = ordersTyped.map((o) => o.order_number)

  // --- Fetch order_products for those orders ---
  const opQ = serviceClient
    .from('order_products')
    .select('order_number,marketplace_product_id,product_name,store_id')
    .eq('user_id', user.id)
    .in('order_number', orderNumbers.length > 0 ? orderNumbers : ['__none__'])
  const { data: opRows } = await opQ

  // --- Fetch ALL master_products for this user ---
  const { data: masterRows } = await serviceClient
    .from('master_products')
    .select('id,marketplace_product_id,product_name,hpp,packaging_cost,store_id')
    .eq('user_id', user.id)

  // --- Fetch orders_all for cross-reference ---
  const oaQ = serviceClient
    .from('orders_all')
    .select('id,order_number,products_json' +
      (migrationCheck.orders_all_estimated_hpp_exists ? ',estimated_hpp' : ''))
    .eq('user_id', user.id)
    .in('order_number', orderNumbers.length > 0 ? orderNumbers : ['__none__'])
  const { data: oaRows } = await oaQ

  // --- Build lookups ---
  const opByOrder = new Map<string, { id: string; name: string | null }[]>()
  for (const row of (opRows ?? []) as { order_number: string; marketplace_product_id: string; product_name: string | null }[]) {
    const arr = opByOrder.get(row.order_number) ?? []
    arr.push({ id: row.marketplace_product_id, name: row.product_name })
    opByOrder.set(row.order_number, arr)
  }

  const hppLookup = new Map<string, { hpp: number; packaging: number; name: string }>()
  for (const mp of (masterRows ?? []) as { marketplace_product_id: string; hpp: number; packaging_cost: number; product_name: string }[]) {
    hppLookup.set(mp.marketplace_product_id, {
      hpp: mp.hpp ?? 0,
      packaging: mp.packaging_cost ?? 0,
      name: mp.product_name,
    })
  }

  const oaByOrder = new Map<string, { estimated_hpp: number | null; product_count: number }>()
  const oaTyped = (oaRows ?? []) as unknown as Array<{ order_number: string; estimated_hpp?: number | null; products_json: unknown }>
  for (const oa of oaTyped) {
    oaByOrder.set(oa.order_number, {
      estimated_hpp: oa.estimated_hpp ?? null,
      product_count: Array.isArray(oa.products_json) ? oa.products_json.length : 0,
    })
  }

  // --- Per-order trace ---
  const orderTrace = ordersTyped.map((o) => {
    const linkedProducts = opByOrder.get(o.order_number) ?? []
    const productLookups = linkedProducts.map((lp) => {
      const m = hppLookup.get(lp.id)
      return {
        product_id: lp.id,
        product_name: lp.name,
        master_found: !!m,
        master_hpp: m?.hpp ?? 0,
        master_packaging: m?.packaging ?? 0,
        master_total: m ? m.hpp + m.packaging : 0,
      }
    })
    const oa = oaByOrder.get(o.order_number)

    const computedHppFromOpf = productLookups.reduce((s, p) => s + p.master_total, 0)

    return {
      order_number: o.order_number,
      order_date: o.order_date,
      original_price: o.original_price,
      total_income: o.total_income,
      stored_estimated_hpp: o.estimated_hpp ?? null,
      orders_all_estimated_hpp: oa?.estimated_hpp ?? null,
      orders_all_product_count: oa?.product_count ?? null,
      order_products_count: linkedProducts.length,
      product_lookups: productLookups,
      computed_hpp_from_order_products: computedHppFromOpf,
      diagnosis:
        (o.estimated_hpp ?? 0) > 0
          ? '✅ orders.estimated_hpp set'
          : (oa?.estimated_hpp ?? 0) > 0
          ? '✅ orders_all.estimated_hpp set (fallback works)'
          : computedHppFromOpf > 0
          ? '✅ runtime fallback works (order_products + master_products)'
          : linkedProducts.length === 0
          ? '❌ NO order_products linked — OPF sheet not parsed correctly'
          : productLookups.every((p) => !p.master_found)
          ? '❌ order_products IDs do not match any master_products ID — ID format mismatch'
          : productLookups.every((p) => p.master_found && p.master_total === 0)
          ? '❌ master_products found but HPP = 0 — user must set HPP'
          : '❓ partial data',
    }
  })

  // --- Mismatch analysis ---
  const opIds = new Set((opRows ?? []).map((r: { marketplace_product_id: string }) => r.marketplace_product_id))
  const masterIds = new Set((masterRows ?? []).map((r: { marketplace_product_id: string }) => r.marketplace_product_id))
  const idsInOpNotMaster = Array.from(opIds).filter((id) => !masterIds.has(id))
  const idsInMasterNotOp = Array.from(masterIds).filter((id) => !opIds.has(id))

  // Detect formatting issues in master_products IDs (commas, dots-with-zero suffix, scientific notation)
  const suspiciousMasterIds = (masterRows ?? [])
    .filter((mp: { marketplace_product_id: string; hpp: number }) => {
      const id = mp.marketplace_product_id
      return /[,\s]/.test(id) || /\.0+$/.test(id) || /[eE]\+/.test(id)
    })
    .map((mp: { id: string; marketplace_product_id: string; hpp: number; product_name: string }) => ({
      id: mp.id,
      raw_id: mp.marketplace_product_id,
      name: mp.product_name,
      hpp: mp.hpp,
    }))

  return NextResponse.json({
    user_id: user.id,
    user_email: user.email,
    migration_status: migrationCheck,
    summary: {
      total_orders: orders?.length ?? 0,
      total_order_products: opRows?.length ?? 0,
      total_master_products: masterRows?.length ?? 0,
      total_orders_all_matches: oaRows?.length ?? 0,
      master_products_with_hpp: (masterRows ?? []).filter((m: { hpp: number; packaging_cost: number }) => m.hpp > 0 || m.packaging_cost > 0).length,
      master_products_zero_hpp: (masterRows ?? []).filter((m: { hpp: number; packaging_cost: number }) => m.hpp === 0 && m.packaging_cost === 0).length,
    },
    id_mismatch: {
      ids_in_order_products_not_in_master: idsInOpNotMaster,
      ids_in_master_not_in_order_products: idsInMasterNotOp,
      suspicious_master_ids: suspiciousMasterIds,
    },
    orders: orderTrace,
  }, { status: 200 })
}
