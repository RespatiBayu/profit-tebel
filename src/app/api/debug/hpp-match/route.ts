import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MasterResolver, normalizeName, type MasterRow } from '@/lib/master-resolver'

/**
 * GET /api/debug/hpp-match[?store=<id>]
 *
 * Comprehensive matching diagnostic. For every order (income + orders_all),
 * runs the live MasterResolver and reports:
 *   - what was looked up (sku, numeric_id, name)
 *   - whether a master was matched, by which key
 *   - master's HPP value
 *   - resulting estimated_hpp value
 *   - vs stored estimated_hpp in DB (to detect stale data)
 *
 * Returns rich JSON consumed by /dashboard/debug page.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store')

  const serviceClient = await createServiceClient()

  // --- Master products ---
  const mpQ = serviceClient
    .from('master_products')
    .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost,store_id')
    .eq('user_id', user.id)
  if (storeId) mpQ.eq('store_id', storeId)
  const { data: masters } = await mpQ

  type MasterFullRow = MasterRow & { store_id: string | null }
  const typedMasters = (masters ?? []) as MasterFullRow[]
  const resolver = new MasterResolver(typedMasters as MasterRow[])

  const masterStats = {
    total: typedMasters.length,
    withHpp: typedMasters.filter((m) => (m.hpp ?? 0) > 0 || (m.packaging_cost ?? 0) > 0).length,
    skuKeyed: typedMasters.filter((m) => !/^\d+$/.test(m.marketplace_product_id)).length,
    numericKeyed: typedMasters.filter((m) => /^\d+$/.test(m.marketplace_product_id)).length,
    duplicateNames: 0,
  }
  // Detect name duplicates
  const nameCounts = new Map<string, number>()
  for (const m of typedMasters) {
    if (m.product_name) {
      const n = normalizeName(m.product_name)
      nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
    }
  }
  for (const c of Array.from(nameCounts.values())) if (c > 1) masterStats.duplicateNames++

  // --- orders_all rows ---
  const oaQ = serviceClient
    .from('orders_all')
    .select('id,order_number,products_json,estimated_hpp,order_date')
    .eq('user_id', user.id)
  if (storeId) oaQ.eq('store_id', storeId)
  const { data: ordersAll } = await oaQ

  type OaRow = {
    id: string
    order_number: string
    products_json: Array<{ marketplace_product_id: string | null; product_name?: string | null; quantity: number }> | null
    estimated_hpp: number | null
    order_date: string | null
  }

  type Trace = {
    order_number: string
    order_date: string | null
    storedHpp: number
    computedHpp: number
    items: Array<{
      sku: string | null
      name: string | null
      qty: number
      matched: boolean
      matchedBy: 'name' | 'sku' | 'numeric' | null
      masterId: string | null
      masterSku: string | null
      masterHpp: number
      masterPackaging: number
    }>
  }

  function buildTrace(orderNumber: string, orderDate: string | null, storedHpp: number, prods: Array<{ sku: string | null; name: string | null; qty: number }>): Trace {
    const items: Trace['items'] = []
    let computedHpp = 0
    for (const p of prods) {
      // Manually replicate resolver logic to capture match-source
      let matchedBy: 'name' | 'sku' | 'numeric' | null = null
      let master: MasterRow | undefined
      if (p.name) {
        const m = resolver.resolve({ productName: p.name })
        if (m) { master = m; matchedBy = 'name' }
      }
      if (!master && p.sku) {
        const m = resolver.resolve({ anyId: p.sku })
        if (m) {
          master = m
          // Was it bySku or byNumeric?
          if (m.marketplace_product_id === p.sku) matchedBy = 'sku'
          else if (m.numeric_id === p.sku) matchedBy = 'numeric'
          else matchedBy = 'sku'
        }
      }
      const hppContribution = master ? (master.hpp + master.packaging_cost) * p.qty : 0
      computedHpp += hppContribution
      items.push({
        sku: p.sku,
        name: p.name,
        qty: p.qty,
        matched: !!master,
        matchedBy,
        masterId: master?.id ?? null,
        masterSku: master?.marketplace_product_id ?? null,
        masterHpp: master?.hpp ?? 0,
        masterPackaging: master?.packaging_cost ?? 0,
      })
    }
    return { order_number: orderNumber, order_date: orderDate, storedHpp, computedHpp, items }
  }

  const oaTraces: Trace[] = []
  let oaTotalRows = 0
  let oaStoredHppGt0 = 0
  let oaComputedHppGt0 = 0
  let oaItemsTotal = 0
  let oaItemsMatched = 0
  for (const row of (ordersAll ?? []) as OaRow[]) {
    oaTotalRows++
    const prods = (row.products_json ?? []).map((p) => ({
      sku: p.marketplace_product_id ?? null,
      name: p.product_name ?? null,
      qty: p.quantity,
    }))
    const t = buildTrace(row.order_number, row.order_date, row.estimated_hpp ?? 0, prods)
    if (t.storedHpp > 0) oaStoredHppGt0++
    if (t.computedHpp > 0) oaComputedHppGt0++
    for (const it of t.items) {
      oaItemsTotal++
      if (it.matched) oaItemsMatched++
    }
    if (oaTraces.length < 25) oaTraces.push(t)
  }

  // --- income orders + order_products ---
  const ordQ = serviceClient
    .from('orders')
    .select('id,order_number,estimated_hpp,order_date')
    .eq('user_id', user.id)
  if (storeId) ordQ.eq('store_id', storeId)
  const { data: incomeOrders } = await ordQ

  const orderNums = ((incomeOrders ?? []) as Array<{ order_number: string }>).map((r) => r.order_number)
  type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
  const opRows: OpRow[] = []
  const CHUNK = 200
  for (let i = 0; i < orderNums.length; i += CHUNK) {
    const opQ = serviceClient
      .from('order_products')
      .select('order_number,marketplace_product_id,product_name,quantity')
      .eq('user_id', user.id)
      .in('order_number', orderNums.slice(i, i + CHUNK))
    if (storeId) opQ.eq('store_id', storeId)
    const { data } = await opQ
    if (data) opRows.push(...(data as OpRow[]))
  }

  const opByOrder = new Map<string, OpRow[]>()
  for (const r of opRows) {
    const arr = opByOrder.get(r.order_number) ?? []
    arr.push(r)
    opByOrder.set(r.order_number, arr)
  }

  const ordTraces: Trace[] = []
  let ordTotalRows = 0
  let ordStoredHppGt0 = 0
  let ordComputedHppGt0 = 0
  let ordItemsTotal = 0
  let ordItemsMatched = 0
  let ordWithNoOp = 0
  for (const row of (incomeOrders ?? []) as Array<{ id: string; order_number: string; estimated_hpp: number | null; order_date: string | null }>) {
    ordTotalRows++
    const ops = opByOrder.get(row.order_number) ?? []
    if (ops.length === 0) ordWithNoOp++
    const prods = ops.map((o) => ({
      sku: o.marketplace_product_id,
      name: o.product_name,
      qty: o.quantity ?? 1,
    }))
    const t = buildTrace(row.order_number, row.order_date, row.estimated_hpp ?? 0, prods)
    if (t.storedHpp > 0) ordStoredHppGt0++
    if (t.computedHpp > 0) ordComputedHppGt0++
    for (const it of t.items) {
      ordItemsTotal++
      if (it.matched) ordItemsMatched++
    }
    if (ordTraces.length < 25) ordTraces.push(t)
  }

  // Sample some unmatched items for visibility (across BOTH sources)
  const unmatchedSamples: Array<{ source: string; order_number: string; sku: string | null; name: string | null }> = []
  for (const t of [...oaTraces, ...ordTraces]) {
    for (const it of t.items) {
      if (!it.matched && unmatchedSamples.length < 15) {
        unmatchedSamples.push({
          source: oaTraces.includes(t) ? 'orders_all' : 'orders',
          order_number: t.order_number,
          sku: it.sku,
          name: it.name,
        })
      }
    }
  }

  // Sample of masters
  const masterSample = typedMasters.slice(0, 20).map((m) => ({
    id: m.id,
    marketplace_product_id: m.marketplace_product_id,
    numeric_id: m.numeric_id,
    product_name: m.product_name,
    hpp: m.hpp,
    packaging_cost: m.packaging_cost,
    isNumericKeyed: /^\d+$/.test(m.marketplace_product_id),
  }))

  return NextResponse.json({
    storeFilter: storeId,
    masterStats,
    masterSample,
    ordersAll: {
      total: oaTotalRows,
      storedHppGt0: oaStoredHppGt0,
      computedHppGt0: oaComputedHppGt0,
      itemsTotal: oaItemsTotal,
      itemsMatched: oaItemsMatched,
      itemsMatchedPct: oaItemsTotal > 0 ? Math.round((oaItemsMatched / oaItemsTotal) * 100) : 0,
      sampleTraces: oaTraces,
    },
    orders: {
      total: ordTotalRows,
      storedHppGt0: ordStoredHppGt0,
      computedHppGt0: ordComputedHppGt0,
      withNoOrderProducts: ordWithNoOp,
      itemsTotal: ordItemsTotal,
      itemsMatched: ordItemsMatched,
      itemsMatchedPct: ordItemsTotal > 0 ? Math.round((ordItemsMatched / ordItemsTotal) * 100) : 0,
      sampleTraces: ordTraces,
    },
    unmatchedSamples,
  })
}
