import * as XLSX from 'xlsx'

export interface OrderProductJson {
  marketplace_product_id: string | null
  product_name: string | null
  quantity: number
  harga_awal: number             // Harga Awal per unit (before any discount) → for omzet calc
  harga_setelah_diskon: number   // Harga Setelah Diskon per unit (after product discount) → for diskon calc
}

export interface ParsedOrderAll {
  order_number: string
  status_pesanan: string | null
  total_pembayaran: number       // Estimated seller payout after all Shopee fees
  seller_voucher: number         // Voucher Ditanggung Penjual + Paket Diskon Penjual (order-level)
  order_date: string | null      // ISO date
  order_complete_date: string | null
  products_json: OrderProductJson[]
}

export interface OrdersAllParseResult {
  orders: ParsedOrderAll[]
  periodStart: string | null
  periodEnd: string | null
}

// Column names in Shopee Order.all export (row 0 = headers)
const COL = {
  ORDER_NUMBER:         'No. Pesanan',
  STATUS:               'Status Pesanan',
  TOTAL_PEMBAYARAN:     'Total Pembayaran',
  ORDER_DATE:           'Waktu Pesanan Dibuat',
  COMPLETE_DATE:        'Waktu Pesanan Selesai',
  SKU_REF:              'Nomor Referensi SKU',
  PRODUCT_NAME:         'Nama Produk',
  QUANTITY:             'Jumlah',
  HARGA_AWAL:           'Harga Awal',
  HARGA_DISKON:         'Harga Setelah Diskon',
  VOUCHER_PENJUAL:      'Voucher Ditanggung Penjual',
  PAKET_DISKON_PENJUAL: 'Paket Diskon (Diskon dari Penjual)',
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

  const colOrderNum        = col(COL.ORDER_NUMBER)
  const colStatus          = col(COL.STATUS)
  const colTotal           = col(COL.TOTAL_PEMBAYARAN)
  const colDate            = col(COL.ORDER_DATE)
  const colComplete        = col(COL.COMPLETE_DATE)
  const colSku             = col(COL.SKU_REF)
  const colProdName        = col(COL.PRODUCT_NAME)
  const colQty             = col(COL.QUANTITY)
  const colHargaAwal       = col(COL.HARGA_AWAL)
  const colHargaDiskon     = col(COL.HARGA_DISKON)
  const colVoucher         = col(COL.VOUCHER_PENJUAL)
  const colPaketDiskon     = col(COL.PAKET_DISKON_PENJUAL)

  if (colOrderNum === -1) {
    throw new Error(
      'Kolom "No. Pesanan" tidak ditemukan. Pastikan file adalah "Order.all" dari Shopee Seller Center.'
    )
  }

  // Group rows by order_number — total_pembayaran and seller_voucher repeat on every SKU row
  const ordersMap = new Map<string, {
    status_pesanan: string | null
    total_pembayaran: number
    seller_voucher: number
    order_date: string | null
    order_complete_date: string | null
    products: OrderProductJson[]
  }>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row) continue

    const orderNum = String(row[colOrderNum] ?? '').trim()
    if (!orderNum || orderNum === '-') continue

    // Per-SKU fields
    const skuId       = colSku      !== -1 ? String(row[colSku]      ?? '').trim() || null : null
    const prodName    = colProdName !== -1 ? String(row[colProdName] ?? '').trim() || null : null
    const qty         = colQty      !== -1 ? Math.max(1, parseInt(String(row[colQty] ?? '1'), 10) || 1) : 1
    const hargaAwal   = colHargaAwal   !== -1 ? parseIdr(row[colHargaAwal])   : 0
    const hargaDiskon = colHargaDiskon !== -1 ? parseIdr(row[colHargaDiskon]) : 0

    if (!ordersMap.has(orderNum)) {
      // First row for this order — grab order-level fields (they repeat on each SKU row)
      const status       = colStatus   !== -1 ? String(row[colStatus] ?? '').trim() || null : null
      const total        = colTotal    !== -1 ? parseIdr(row[colTotal])    : 0
      const orderDate    = colDate     !== -1 ? parseDate(row[colDate])    : null
      const completeDate = colComplete !== -1 ? parseDate(row[colComplete]): null
      // Seller-borne voucher/discount at order level
      const voucher     = colVoucher     !== -1 ? parseIdr(row[colVoucher])     : 0
      const paketDiskon = colPaketDiskon !== -1 ? parseIdr(row[colPaketDiskon]) : 0

      ordersMap.set(orderNum, {
        status_pesanan: status,
        total_pembayaran: total,
        seller_voucher: voucher + paketDiskon,
        order_date: orderDate,
        order_complete_date: completeDate,
        products: [],
      })
    }

    ordersMap.get(orderNum)!.products.push({
      marketplace_product_id: skuId,
      product_name: prodName,
      quantity: qty,
      harga_awal: hargaAwal,
      harga_setelah_diskon: hargaDiskon,
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
      seller_voucher: data.seller_voucher,
      order_date: data.order_date,
      order_complete_date: data.order_complete_date,
      products_json: data.products,
    })
  }

  return { orders, periodStart, periodEnd }
}
