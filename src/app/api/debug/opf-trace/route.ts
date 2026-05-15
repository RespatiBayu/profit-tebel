import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'
import * as XLSX from 'xlsx'

/**
 * POST /api/debug/opf-trace
 * Form: file (income XLSX)
 *
 * Runs ONLY the OPF (Order Processing Fee) parsing logic and returns a deep
 * diagnostic — no DB writes. Helps answer: "why does the income parser only
 * create order_products for 11 out of 267 orders?"
 *
 * Returns:
 *   - sheet name(s) tried, which was found
 *   - total raw rows in OPF sheet
 *   - distinct rowType values (case-insensitive) — exposes "Pesanan"/"Sku"/etc
 *   - parsed OPF rows count + sample
 *   - distinct order_numbers seen in OPF
 *   - cross-check: which income.order_number from DB are MISSING in OPF
 *   - resolver match counts (matched/unmatched + sample unmatched)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const storeId = (formData.get('storeId') as string | null) ?? null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })

  // ---- Find the OPF sheet ----
  const sheetNamesAll = wb.SheetNames
  const opfSheetName =
    sheetNamesAll.find((n) => n.toLowerCase().includes('order processing')) ??
    sheetNamesAll.find((n) => n.toLowerCase().includes('fee')) ??
    sheetNamesAll[3] ?? // 4th sheet by convention
    null
  const opfSheet = opfSheetName ? wb.Sheets[opfSheetName] : null

  if (!opfSheet) {
    return NextResponse.json({
      sheet_names: sheetNamesAll,
      opfSheetName,
      error: 'OPF sheet not found',
    })
  }

  const opfRowsRaw: unknown[][] = XLSX.utils.sheet_to_json(opfSheet, {
    header: 1,
    defval: null,
    raw: true,
  })

  // ---- Inventory column B (rowType marker) values ----
  const colBCounts = new Map<string, number>()
  for (const r of opfRowsRaw) {
    if (r && r[1] != null) {
      const v = String(r[1]).trim()
      if (v) colBCounts.set(v, (colBCounts.get(v) ?? 0) + 1)
    }
  }

  // ---- Replicate parser logic ----
  type ParsedOpf = { order_number: string; marketplace_product_id: string; product_name: string | null }
  const parsedRows: ParsedOpf[] = []
  let currentOrderNumber: string | null = null
  const allOrderRowTypes = new Set<string>()
  let orderMarkerRows = 0
  let skuMarkerRows = 0
  let skuRowsWithoutCurrentOrder = 0
  let skuRowsWithoutProductId = 0

  const parseStr = (v: unknown): string | null => {
    if (v == null) return null
    const s = String(v).trim()
    return s || null
  }

  for (let i = 1; i < opfRowsRaw.length; i++) {
    const row = opfRowsRaw[i]
    if (!row) continue
    const rowTypeRaw = parseStr(row[1])
    const rowType = rowTypeRaw?.toLowerCase()

    if (rowType) allOrderRowTypes.add(rowType)

    if (rowType === 'order' || rowType === 'pesanan') {
      orderMarkerRows++
      currentOrderNumber = parseStr(row[2]) // column C — ORDER_NUMBER
    } else if (rowType === 'sku' || rowType === 'produk') {
      skuMarkerRows++
      if (!currentOrderNumber) {
        skuRowsWithoutCurrentOrder++
        continue
      }
      const rawId = row[3] // column D — PRODUCT_ID per current parser
      const productId = rawId != null
        ? String(rawId).replace(/[,.\s]/g, '').trim() || null
        : null
      if (!productId) {
        skuRowsWithoutProductId++
        continue
      }
      parsedRows.push({
        order_number: currentOrderNumber,
        marketplace_product_id: productId,
        product_name: parseStr(row[4]), // column E — PRODUCT_NAME
      })
    }
  }

  const distinctOrderNumbersInOpf = new Set(parsedRows.map((r) => r.order_number))

  // ---- Compare to income orders in DB ----
  const ordersQ = supabase
    .from('orders')
    .select('order_number,order_date')
    .eq('user_id', user.id)
  if (storeId) ordersQ.eq('store_id', storeId)
  const { data: dbOrders } = await ordersQ
  const dbOrderNums = new Set(((dbOrders ?? []) as Array<{ order_number: string }>).map((r) => r.order_number))

  const inOpfButNotInDb: string[] = []
  for (const n of Array.from(distinctOrderNumbersInOpf)) {
    if (!dbOrderNums.has(n)) inOpfButNotInDb.push(n)
  }

  const inDbButNotInOpf: Array<{ order_number: string; order_date: string | null }> = []
  for (const r of (dbOrders ?? []) as Array<{ order_number: string; order_date: string | null }>) {
    if (!distinctOrderNumbersInOpf.has(r.order_number)) {
      inDbButNotInOpf.push({ order_number: r.order_number, order_date: r.order_date })
    }
  }

  // ---- Resolve OPF rows against current master_products ----
  const mpQ = supabase
    .from('master_products')
    .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
    .eq('user_id', user.id)
  if (storeId) mpQ.eq('store_id', storeId)
  const { data: masters } = await mpQ
  const resolver = new MasterResolver((masters ?? []) as MasterRow[])

  let matched = 0
  let unmatched = 0
  const unmatchedSamples: ParsedOpf[] = []
  for (const r of parsedRows) {
    const m = resolver.resolve({
      anyId: r.marketplace_product_id,
      productName: r.product_name,
    })
    if (m) matched++
    else {
      unmatched++
      if (unmatchedSamples.length < 10) unmatchedSamples.push(r)
    }
  }

  return NextResponse.json({
    sheet_names: sheetNamesAll,
    opfSheetName,
    opfSheetRawRowCount: opfRowsRaw.length,
    colB_marker_distribution: Object.fromEntries(Array.from(colBCounts.entries()).slice(0, 30)),
    allRowTypesLowercase: Array.from(allOrderRowTypes),
    orderMarkerRows,
    skuMarkerRows,
    skuRowsWithoutCurrentOrder,
    skuRowsWithoutProductId,
    parsedOpfRows: parsedRows.length,
    distinctOrderNumbersInOpf: distinctOrderNumbersInOpf.size,
    sample_parsed: parsedRows.slice(0, 10),
    dbOrdersCount: dbOrderNums.size,
    inOpfButNotInDb_count: inOpfButNotInDb.length,
    inOpfButNotInDb_sample: inOpfButNotInDb.slice(0, 5),
    inDbButNotInOpf_count: inDbButNotInOpf.length,
    inDbButNotInOpf_sample: inDbButNotInOpf.slice(0, 10),
    masterMatching: {
      matched,
      unmatched,
      total: parsedRows.length,
      unmatchedSamples,
    },
  })
}
