import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'
import * as XLSX from 'xlsx'

/**
 * GET /api/export/qty-by-product?year=2026&month=04[&store=<id>]
 *
 * Generates an XLSX file with total qty sold per product for the given month.
 * Sources:
 *   - orders_all.products_json (accurate per-SKU qty for pending + selesai)
 *   - order_products (income orders' SKU mapping)
 *
 * To avoid double-counting orders that appear in BOTH tables (income & Order.all),
 * we dedupe by order_number — orders_all wins (it has multi-qty per row).
 *
 * Output columns: SKU, Product Name, Qty (orders_all), Qty (income only),
 * Total Qty, HPP per unit, Packaging per unit, Total HPP.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? '2026'
  const month = (searchParams.get('month') ?? '04').padStart(2, '0')
  const storeId = searchParams.get('store')

  const periodStart = `${year}-${month}-01`
  // Compute end as first day of next month
  const ny = month === '12' ? String(Number(year) + 1) : year
  const nm = month === '12' ? '01' : String(Number(month) + 1).padStart(2, '0')
  const periodEndExclusive = `${ny}-${nm}-01`

  const serviceClient = await createServiceClient()

  // Master products + resolver
  const mpQ = serviceClient
    .from('master_products')
    .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
    .eq('user_id', user.id)
  if (storeId) mpQ.eq('store_id', storeId)
  const { data: masters } = await mpQ
  const resolver = new MasterResolver((masters ?? []) as MasterRow[])

  // Aggregator
  type AggRow = {
    masterId: string | null
    sku: string
    name: string
    hpp: number
    packaging: number
    qtyFromOa: number
    qtyFromOpf: number
  }
  const agg = new Map<string, AggRow>()

  function bump(
    key: string,
    sku: string,
    name: string,
    qty: number,
    source: 'oa' | 'opf',
    masterId: string | null,
    hpp: number,
    packaging: number
  ) {
    const e = agg.get(key) ?? {
      masterId,
      sku,
      name,
      hpp,
      packaging,
      qtyFromOa: 0,
      qtyFromOpf: 0,
    }
    if (source === 'oa') e.qtyFromOa += qty
    else e.qtyFromOpf += qty
    agg.set(key, e)
  }

  // --- orders_all for April ---
  const oaQ = serviceClient
    .from('orders_all')
    .select('order_number,products_json,order_date')
    .eq('user_id', user.id)
    .gte('order_date', periodStart)
    .lt('order_date', periodEndExclusive)
  if (storeId) oaQ.eq('store_id', storeId)
  const { data: oaRows } = await oaQ

  type OaProd = { marketplace_product_id: string | null; product_name?: string | null; quantity: number }
  const oaOrderNums = new Set<string>()
  for (const r of (oaRows ?? []) as Array<{ order_number: string; products_json: unknown }>) {
    oaOrderNums.add(r.order_number)
    const prods = (r.products_json ?? []) as OaProd[]
    for (const p of prods) {
      const master = resolver.resolve({
        anyId: p.marketplace_product_id,
        productName: p.product_name,
      })
      const key = master?.id ?? `unmatched:${p.marketplace_product_id ?? p.product_name ?? '?'}`
      bump(
        key,
        master?.marketplace_product_id ?? p.marketplace_product_id ?? '?',
        master?.product_name ?? p.product_name ?? '?',
        p.quantity,
        'oa',
        master?.id ?? null,
        master?.hpp ?? 0,
        master?.packaging_cost ?? 0
      )
    }
  }

  // --- income orders for April (skip ones already in orders_all to avoid double count) ---
  const ordQ = serviceClient
    .from('orders')
    .select('order_number,order_date')
    .eq('user_id', user.id)
    .gte('order_date', periodStart)
    .lt('order_date', periodEndExclusive)
  if (storeId) ordQ.eq('store_id', storeId)
  const { data: incomeOrders } = await ordQ

  const incomeOrderNumsApr = ((incomeOrders ?? []) as Array<{ order_number: string }>)
    .map((r) => r.order_number)
    .filter((n) => !oaOrderNums.has(n))

  if (incomeOrderNumsApr.length > 0) {
    const CHUNK = 200
    type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
    const opRows: OpRow[] = []
    for (let i = 0; i < incomeOrderNumsApr.length; i += CHUNK) {
      const opQ = serviceClient
        .from('order_products')
        .select('order_number,marketplace_product_id,product_name,quantity')
        .eq('user_id', user.id)
        .in('order_number', incomeOrderNumsApr.slice(i, i + CHUNK))
      if (storeId) opQ.eq('store_id', storeId)
      const { data } = await opQ
      if (data) opRows.push(...(data as OpRow[]))
    }
    for (const r of opRows) {
      const master = resolver.resolve({
        anyId: r.marketplace_product_id,
        productName: r.product_name,
      })
      const key = master?.id ?? `unmatched:${r.marketplace_product_id ?? r.product_name ?? '?'}`
      bump(
        key,
        master?.marketplace_product_id ?? r.marketplace_product_id ?? '?',
        master?.product_name ?? r.product_name ?? '?',
        r.quantity ?? 1,
        'opf',
        master?.id ?? null,
        master?.hpp ?? 0,
        master?.packaging_cost ?? 0
      )
    }
  }

  // Sort by total qty desc
  const rows = Array.from(agg.values())
    .map((r) => ({
      ...r,
      totalQty: r.qtyFromOa + r.qtyFromOpf,
    }))
    .sort((a, b) => b.totalQty - a.totalQty)

  // Build XLSX
  const wsData: (string | number)[][] = [
    [
      'SKU',
      'Nama Produk',
      'Qty Order.all',
      'Qty Income (OPF)',
      'Total Qty',
      'HPP / unit',
      'Packaging / unit',
      'Total HPP',
    ],
  ]
  let grandQty = 0
  let grandHpp = 0
  for (const r of rows) {
    const totalHpp = (r.hpp + r.packaging) * r.totalQty
    grandQty += r.totalQty
    grandHpp += totalHpp
    wsData.push([
      r.sku,
      r.name,
      r.qtyFromOa,
      r.qtyFromOpf,
      r.totalQty,
      r.hpp,
      r.packaging,
      totalHpp,
    ])
  }
  wsData.push([])
  wsData.push(['TOTAL', '', '', '', grandQty, '', '', grandHpp])

  // Source summary
  wsData.push([])
  wsData.push(['Periode', `${year}-${month}`])
  wsData.push(['Store filter', storeId ?? 'Semua toko'])
  wsData.push(['Orders_all (Order.all)', (oaRows ?? []).length])
  wsData.push(['Income orders', (incomeOrders ?? []).length])
  wsData.push(['Income orders unique (di luar Order.all)', incomeOrderNumsApr.length])

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 28 }, // SKU
    { wch: 70 }, // Name
    { wch: 14 }, // Qty Order.all
    { wch: 16 }, // Qty Income
    { wch: 12 }, // Total Qty
    { wch: 12 }, // HPP/unit
    { wch: 14 }, // Packaging
    { wch: 14 }, // Total HPP
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Qty per Produk ${year}-${month}`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `qty-per-produk-${year}-${month}${storeId ? `-${storeId.slice(0, 8)}` : ''}.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
