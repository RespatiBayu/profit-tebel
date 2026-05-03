import * as XLSX from 'xlsx'

export interface ParsedOrderAll {
  order_number: string
  status_pesanan: string | null
  total_pembayaran: number
  order_date: string | null   // ISO date
  order_complete_date: string | null
}

export interface OrdersAllParseResult {
  orders: ParsedOrderAll[]
  periodStart: string | null
  periodEnd: string | null
}

// Column names in Shopee Order.all export (row 0 = headers)
const COL_NAMES = {
  ORDER_NUMBER: 'No. Pesanan',
  STATUS: 'Status Pesanan',
  TOTAL_PEMBAYARAN: 'Total Pembayaran',
  ORDER_DATE: 'Waktu Pesanan Dibuat',
  COMPLETE_DATE: 'Waktu Pesanan Selesai',
} as const

function parseIdr(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  // Indonesian format: "1.234.567" = 1234567 (dots are thousands separators)
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

  const colOrderNum = col(COL_NAMES.ORDER_NUMBER)
  const colStatus = col(COL_NAMES.STATUS)
  const colTotal = col(COL_NAMES.TOTAL_PEMBAYARAN)
  const colDate = col(COL_NAMES.ORDER_DATE)
  const colComplete = col(COL_NAMES.COMPLETE_DATE)

  if (colOrderNum === -1) {
    throw new Error(
      'Kolom "No. Pesanan" tidak ditemukan. Pastikan file adalah "Order.all" dari Shopee Seller Center.'
    )
  }

  // Dedupe: satu baris per order_number (file punya multi-row per order untuk multi-SKU)
  const seen = new Set<string>()
  const orders: ParsedOrderAll[] = []
  let periodStart: string | null = null
  let periodEnd: string | null = null

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row) continue

    const orderNum = String(row[colOrderNum] ?? '').trim()
    if (!orderNum || orderNum === '-') continue
    if (seen.has(orderNum)) continue // skip duplicate SKU rows of same order
    seen.add(orderNum)

    const status = colStatus !== -1 ? String(row[colStatus] ?? '').trim() || null : null
    const total = colTotal !== -1 ? parseIdr(row[colTotal]) : 0
    const orderDate = colDate !== -1 ? parseDate(row[colDate]) : null
    const completeDate = colComplete !== -1 ? parseDate(row[colComplete]) : null

    if (orderDate) {
      if (!periodStart || orderDate < periodStart) periodStart = orderDate
      if (!periodEnd || orderDate > periodEnd) periodEnd = orderDate
    }

    orders.push({
      order_number: orderNum,
      status_pesanan: status,
      total_pembayaran: total,
      order_date: orderDate,
      order_complete_date: completeDate,
    })
  }

  if (orders.length === 0) {
    throw new Error('Tidak ada data pesanan ditemukan. Pastikan file adalah "Order.all" dari Shopee Seller Center.')
  }

  return { orders, periodStart, periodEnd }
}
