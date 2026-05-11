import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'
import * as XLSX from 'xlsx'

/**
 * GET /api/export/qty-by-product?year=YYYY&month=MM[&store=ID]
 *
 * 3-sheet XLSX for HPP validation:
 *  - Sheet 1 "Per Produk": aggregate qty + HPP + omzet per product, split by:
 *      Qty Pending (orders_all w/ non-selesai status)
 *      Qty Selesai Order.all
 *      Qty Income Only (in income, not in orders_all)
 *      Total Qty
 *  - Sheet 2 "Per Order": every order in the period with status, products,
 *    qty, computed HPP, omzet/total_pembayaran, source (income vs orders_all)
 *  - Sheet 3 "Ringkasan": count breakdown by status, grand totals,
 *    dashboard reconciliation hints
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
  const ny = month === '12' ? String(Number(year) + 1) : year
  const nm = month === '12' ? '01' : String(Number(month) + 1).padStart(2, '0')
  const periodEndExclusive = `${ny}-${nm}-01`

  const serviceClient = await createServiceClient()
  const PENDING_STATUSES = new Set(['Telah Dikirim', 'Sedang Dikirim', 'Perlu Dikirim', 'Belum Bayar'])

  // Master products + resolver
  const mpQ = serviceClient
    .from('master_products')
    .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
    .eq('user_id', user.id)
  if (storeId) mpQ.eq('store_id', storeId)
  const { data: masters } = await mpQ
  const resolver = new MasterResolver((masters ?? []) as MasterRow[])

  // Per-product aggregator
  type AggRow = {
    masterId: string | null
    sku: string
    name: string
    hpp: number
    packaging: number
    qtyPending: number
    qtySelesaiOa: number
    qtyIncomeOnly: number
  }
  const agg = new Map<string, AggRow>()
  function getAgg(key: string, sku: string, name: string, masterId: string | null, hpp: number, packaging: number) {
    let e = agg.get(key)
    if (!e) {
      e = { masterId, sku, name, hpp, packaging, qtyPending: 0, qtySelesaiOa: 0, qtyIncomeOnly: 0 }
      agg.set(key, e)
    }
    return e
  }

  // Per-order detail rows for sheet 2
  type OrderDetail = {
    source: 'orders_all' | 'income'
    orderNumber: string
    date: string | null
    status: string | null
    products: string
    totalQty: number
    estimatedHpp: number
    omzet: number
    netIncome: number
  }
  const orderDetails: OrderDetail[] = []

  // Status counters for sheet 3
  const statusCounts = new Map<string, number>()
  function bumpStatus(status: string | null) {
    const k = status ?? '(no status)'
    statusCounts.set(k, (statusCounts.get(k) ?? 0) + 1)
  }

  // ---- orders_all in period ----
  const oaQ = serviceClient
    .from('orders_all')
    .select('order_number,products_json,order_date,status_pesanan,total_pembayaran,seller_voucher')
    .eq('user_id', user.id)
    .gte('order_date', periodStart)
    .lt('order_date', periodEndExclusive)
  if (storeId) oaQ.eq('store_id', storeId)
  const { data: oaRows } = await oaQ

  type OaProd = {
    marketplace_product_id: string | null
    product_name?: string | null
    quantity: number
    harga_awal?: number
    harga_setelah_diskon?: number
  }
  type OaRow = {
    order_number: string
    products_json: unknown
    order_date: string | null
    status_pesanan: string | null
    total_pembayaran: number | null
    seller_voucher: number | null
  }
  const oaOrderNums = new Set<string>()
  for (const r of (oaRows ?? []) as OaRow[]) {
    oaOrderNums.add(r.order_number)
    const status = r.status_pesanan
    const isPending = status ? PENDING_STATUSES.has(status) : false
    bumpStatus(status)
    const prods = (r.products_json ?? []) as OaProd[]
    let detailQty = 0
    let detailOmzet = 0
    let detailHpp = 0
    const namesArr: string[] = []
    for (const p of prods) {
      const master = resolver.resolve({
        anyId: p.marketplace_product_id,
        productName: p.product_name,
      })
      const key = master?.id ?? `unmatched:${p.marketplace_product_id ?? p.product_name ?? '?'}`
      const a = getAgg(
        key,
        master?.marketplace_product_id ?? p.marketplace_product_id ?? '?',
        master?.product_name ?? p.product_name ?? '?',
        master?.id ?? null,
        master?.hpp ?? 0,
        master?.packaging_cost ?? 0
      )
      if (isPending) a.qtyPending += p.quantity
      else a.qtySelesaiOa += p.quantity

      detailQty += p.quantity
      detailOmzet += (p.harga_awal ?? 0) * p.quantity
      detailHpp += ((master?.hpp ?? 0) + (master?.packaging_cost ?? 0)) * p.quantity
      namesArr.push(`${p.quantity}× ${master?.product_name ?? p.product_name ?? '?'}`)
    }
    orderDetails.push({
      source: 'orders_all',
      orderNumber: r.order_number,
      date: r.order_date,
      status,
      products: namesArr.join(' | '),
      totalQty: detailQty,
      estimatedHpp: detailHpp,
      omzet: detailOmzet,
      netIncome: r.total_pembayaran ?? 0,
    })
  }

  // ---- income orders in period, only those NOT in orders_all to avoid double count ----
  const ordQ = serviceClient
    .from('orders')
    .select('order_number,order_date,status,original_price,total_income,estimated_hpp')
    .eq('user_id', user.id)
    .gte('order_date', periodStart)
    .lt('order_date', periodEndExclusive)
  if (storeId) ordQ.eq('store_id', storeId)
  const { data: incomeOrders } = await ordQ

  type IncomeRow = {
    order_number: string
    order_date: string | null
    status: string | null
    original_price: number | null
    total_income: number | null
    estimated_hpp: number | null
  }
  const incomeFiltered = ((incomeOrders ?? []) as IncomeRow[]).filter((r) => !oaOrderNums.has(r.order_number))

  if (incomeFiltered.length > 0) {
    const incomeOrderNums = incomeFiltered.map((r) => r.order_number)
    const CHUNK = 200
    type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
    const opRows: OpRow[] = []
    for (let i = 0; i < incomeOrderNums.length; i += CHUNK) {
      const opQ = serviceClient
        .from('order_products')
        .select('order_number,marketplace_product_id,product_name,quantity')
        .eq('user_id', user.id)
        .in('order_number', incomeOrderNums.slice(i, i + CHUNK))
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

    for (const o of incomeFiltered) {
      // Note: income status = "Dilepas" essentially (it's in income table)
      bumpStatus(o.status ?? 'Dilepas')
      const items = opByOrder.get(o.order_number) ?? []
      let detailQty = 0
      const namesArr: string[] = []
      for (const it of items) {
        const master = resolver.resolve({
          anyId: it.marketplace_product_id,
          productName: it.product_name,
        })
        const key = master?.id ?? `unmatched:${it.marketplace_product_id ?? it.product_name ?? '?'}`
        const a = getAgg(
          key,
          master?.marketplace_product_id ?? it.marketplace_product_id ?? '?',
          master?.product_name ?? it.product_name ?? '?',
          master?.id ?? null,
          master?.hpp ?? 0,
          master?.packaging_cost ?? 0
        )
        const q = it.quantity ?? 1
        a.qtyIncomeOnly += q
        detailQty += q
        namesArr.push(`${q}× ${master?.product_name ?? it.product_name ?? '?'}`)
      }
      orderDetails.push({
        source: 'income',
        orderNumber: o.order_number,
        date: o.order_date,
        status: o.status ?? 'Dilepas',
        products: namesArr.join(' | ') || '(tidak ada mapping produk)',
        totalQty: detailQty,
        estimatedHpp: o.estimated_hpp ?? 0,
        omzet: o.original_price ?? 0,
        netIncome: o.total_income ?? 0,
      })
    }
  }

  // ===========================================================================
  // SHEET 1 — Per Produk
  // ===========================================================================
  const sheet1Data: (string | number)[][] = [
    [
      'SKU',
      'Nama Produk',
      'Qty Pending (Order.all)',
      'Qty Selesai (Order.all)',
      'Qty Income Only',
      'Total Qty',
      'HPP / unit',
      'Packaging / unit',
      'Total HPP',
    ],
  ]
  const productRows = Array.from(agg.values())
    .map((r) => ({ ...r, totalQty: r.qtyPending + r.qtySelesaiOa + r.qtyIncomeOnly }))
    .sort((a, b) => b.totalQty - a.totalQty)
  let grandQty = 0
  let grandHpp = 0
  for (const r of productRows) {
    const totalHpp = (r.hpp + r.packaging) * r.totalQty
    grandQty += r.totalQty
    grandHpp += totalHpp
    sheet1Data.push([
      r.sku,
      r.name,
      r.qtyPending,
      r.qtySelesaiOa,
      r.qtyIncomeOnly,
      r.totalQty,
      r.hpp,
      r.packaging,
      totalHpp,
    ])
  }
  sheet1Data.push([])
  sheet1Data.push(['TOTAL', '', '', '', '', grandQty, '', '', grandHpp])
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data)
  ws1['!cols'] = [
    { wch: 28 }, { wch: 70 }, { wch: 20 }, { wch: 20 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ]

  // ===========================================================================
  // SHEET 2 — Per Order Detail
  // ===========================================================================
  const sheet2Data: (string | number)[][] = [
    [
      'Source',
      'Order Number',
      'Tanggal',
      'Status',
      'Produk (qty × nama)',
      'Total Qty',
      'Omzet (harga awal)',
      'Net Income / Total Pembayaran',
      'Estimated HPP',
    ],
  ]
  orderDetails.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  let sumOmzetPending = 0
  let sumHppPending = 0
  let sumOmzetIncome = 0
  let sumHppIncome = 0
  for (const d of orderDetails) {
    const isPending = d.source === 'orders_all' && d.status ? PENDING_STATUSES.has(d.status) : false
    if (isPending) {
      sumOmzetPending += d.omzet
      sumHppPending += d.estimatedHpp
    } else if (d.source === 'income') {
      sumOmzetIncome += d.omzet
      sumHppIncome += d.estimatedHpp
    }
    sheet2Data.push([
      d.source,
      d.orderNumber,
      d.date ?? '',
      d.status ?? '',
      d.products,
      d.totalQty,
      d.omzet,
      d.netIncome,
      d.estimatedHpp,
    ])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data)
  ws2['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 60 },
    { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
  ]

  // ===========================================================================
  // SHEET 3 — Ringkasan + Reconciliation
  // ===========================================================================
  const sheet3Data: (string | number)[][] = [
    ['Periode', `${year}-${month}`],
    ['Store filter', storeId ?? 'Semua toko'],
    [],
    ['=== Status Breakdown ==='],
    ['Status', 'Jumlah Order'],
  ]
  for (const [s, c] of Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1])) {
    sheet3Data.push([s, c])
  }
  sheet3Data.push([])
  sheet3Data.push(['=== Grand Totals ==='])
  sheet3Data.push(['Total Order orders_all', (oaRows ?? []).length])
  sheet3Data.push(['Total Order Income', (incomeOrders ?? []).length])
  sheet3Data.push(['Total Order Income (unik, di luar orders_all)', incomeFiltered.length])
  sheet3Data.push([])
  sheet3Data.push(['=== Pendapatan (Income — Sudah Dilepas) ==='])
  sheet3Data.push(['Total Omzet (original_price)', sumOmzetIncome])
  sheet3Data.push(['Total HPP', sumHppIncome])
  sheet3Data.push([])
  sheet3Data.push(['=== Dana Pending (Order.all status pending) ==='])
  sheet3Data.push(['Total Omzet (harga_awal × qty)', sumOmzetPending])
  sheet3Data.push(['Total HPP', sumHppPending])
  sheet3Data.push([])
  sheet3Data.push(['=== Cross-Check ==='])
  sheet3Data.push(['Total Omzet Gabungan', sumOmzetIncome + sumOmzetPending])
  sheet3Data.push(['Total HPP Gabungan', sumHppIncome + sumHppPending])
  sheet3Data.push([])
  sheet3Data.push(['Catatan'])
  sheet3Data.push(['Income KPI di dashboard pakai sumber "Income" (sudah dilepas)'])
  sheet3Data.push(['Dana Pending KPI di dashboard pakai sumber "Pending" (orders_all status pending)'])
  sheet3Data.push(['Selesai (Order.all) yang sudah masuk Income TIDAK double-count (di-dedupe pakai order_number)'])

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data)
  ws3['!cols'] = [{ wch: 50 }, { wch: 22 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Per Produk')
  XLSX.utils.book_append_sheet(wb, ws2, 'Per Order')
  XLSX.utils.book_append_sheet(wb, ws3, 'Ringkasan')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `qty-validasi-${year}-${month}${storeId ? `-${storeId.slice(0, 8)}` : ''}.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
