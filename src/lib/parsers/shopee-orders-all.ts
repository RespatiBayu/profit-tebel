import * as XLSX from 'xlsx'

export interface OrderProductJson {
  marketplace_product_id: string | null
  product_name: string | null
  quantity: number
}

export interface ParsedOrderAll {
  order_number: string
  status_pesanan: string | null
  total_pembayaran: number
  order_date: string | null        // ISO date
  order_complete_date: string | null
  products_json: OrderProductJson[] // SKU rows for this order (for HPP estimation)
}

export interface OrdersAllParseResult {
  orders: ParsedOrderAll[]
  periodStart: string | null
  periodEnd: string | null
}

// Column names in Shopee Order.all export (row 0 = headers)
const COL = {
  ORDER_NUMBER:    'No. Pesanan',
  STATUS:          'Status Pesanan',
  TOTAL_PEMBAYARAN:'Total Pembayaran',
  ORDER_DATE:      'Waktu Pesanan Dibuat',
  COMPLETE_DATE:   'Waktu Pesanan Selesai',
  SKU_REF:         'Nomor Referensi SKU',   // marketplace_product_id
  PRODUCT_NAME:    'Nama Produk',
  QUANTITY:        'Jumlah',               // qty per SKU row
} as const

// Indonesian IDR format: "1.234.567" → 1234567 (dots = thousands sep, comma = decimal)
function parseIdr(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const s = String(val).replace(/\./g, '').replace(',', '.').trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '' || val === '-') return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  if (!s || s === '-') return null
  // "2026-04-01 10:36" or "2026-04-01"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  return null
}

export function parseShopeeOrdersAll(buffer: Buffer): OrdersAllParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets['orders'] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Sheet "orders" tidak ditemukan dalam file Order.all')

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 2) throw new Error('File kosong atau tidak ada data pesanan')

  // Row 0 = headers, find column indices by name
  const headerRow = (rows[0] as unknown[]).map((h) => String(h ?? '').trim())
  const col = (name: string) => headerRow.indexOf(name)

  const colOrderNum   = col(COL.ORDER_NUMBER)
  const colStatus     = col(COL.STATUS)
  const colTotal      = col(COL.TOTAL_PEMBAYARAN)
  const colDate       = col(COL.ORDER_DATE)
  const colComplete   = col(COL.COMPLETE_DATE)
  const colSku        = col(COL.SKU_REF)
  const colProdName   = col(COL.PRODUCT_NAME)
  const colQty        = col(COL.QUANTITY)

  if (colOrderNum === -1) {
    throw new Error(
      'Kolom "No. Pesanan" tidak ditemukan. Pastikan file adalah "Order.all" dari Shopee Seller Center.'
    )
  }

  // Group rows by order_number: total_pembayaran repeats on every SKU row → take once
  const ordersMap = new Map<string, {
    status_pesanan: string | null
    total_pembayaran: number
    order_date: string | null
    order_complete_date: string | null
    products: OrderProductJson[]
  }>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row) continue

    const orderNum = String(row[colOrderNum] ?? '').trim()
    if (!orderNum || orderNum === '-') continue

    const skuId = colSku !== -1 ? String(row[colSku] ?? '').trim() || null : null
    const prodName = colProdName !== -1 ? String(row[colProdName] ?? '').trim() || null : null
    const qty = colQty !== -1 ? Math.max(1, parseInt(String(row[colQty] ?? '1'), 10) || 1) : 1

    if (!ordersMap.has(orderNum)) {
      // First row for this order — grab order-level fields
      const status = colStatus !== -1 ? String(row[colStatus] ?? '').trim() || null : null
      const total  = colTotal  !== -1 ? parseIdr(row[colTotal]) : 0
      const orderDate    = colDate     !== -1 ? parseDate(row[colDate])     : null
      const completeDate = colComplete !== -1 ? parseDate(row[colComplete]) : null

      ordersMap.set(orderNum, {
        status_pesanan: status,
        total_pembayaran: total,
        order_date: orderDate,
        order_complete_date: completeDate,
        products: [],
      })
    }

    // Always push the SKU product line (even if skuId is null — bundle/set)
    ordersMap.get(orderNum)!.products.push({
      marketplace_product_id: skuId,
      product_name: prodName,
      quantity: qty,
    })
  }

  if (ordersMap.size === 0) {
    throw new Error('Tidak ada data pesanan ditemukan. Pastikan file adalah "Order.all" dari Shopee Seller Center.')
  }

  let periodStart: string | null = null
  let periodEnd: string | null = null

  const orders: ParsedOrderAll[] = []
  for (const [orderNum, data] of Array.from(ordersMap)) {
    if (data.order_date) {
      if (!periodStart || data.order_date < periodStart) periodStart = data.order_date
      if (!periodEnd   || data.order_date > periodEnd)   periodEnd   = data.order_date
    }
    orders.push({
      order_number: orderNum,
      status_pesanan: data.status_pesanan,
      total_pembayaran: data.total_pembayaran,
      order_date: data.order_date,
      order_complete_date: data.order_complete_date,
      products_json: data.products,
    })
  }

  return { orders, periodStart, periodEnd }
}
