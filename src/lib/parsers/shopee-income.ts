import * as XLSX from 'xlsx'
import type { IncomeParseResult, ParsedOrder, ParsedOrderProduct } from '@/types'

// Column indices in Income sheet (0-based)
const COL = {
  BUYER_USERNAME: 0,        // A - Username (Pembeli)
  ORDER_NUMBER: 1,          // B - No. Pesanan
  BUYER_NAME: 3,            // D - Nama Penerima
  ORDER_DATE: 4,            // E - Waktu Pesanan Dibuat
  PAYMENT_METHOD: 5,        // F - Metode Pembayaran
  RELEASE_DATE: 6,          // G - Tanggal Dana Dilepaskan
  ORIGINAL_PRICE: 7,        // H - Harga Asli Produk
  PRODUCT_DISCOUNT: 8,      // I - Total Diskon Produk
  REFUND_AMOUNT: 9,         // J - Jumlah Pengembalian Dana
  SELLER_VOUCHER: 11,       // L - Voucher disponsori Penjual
  SELLER_VOUCHER_COFUND: 12, // M - Voucher co-fund
  SELLER_CASHBACK: 13,      // N - Cashback Koin disponsori Penjual
  BUYER_SHIPPING: 15,       // P - Ongkir Dibayar Pembeli
  SHOPEE_SHIPPING_SUBSIDY: 17, // R - Gratis Ongkir dari Shopee
  ACTUAL_SHIPPING: 18,      // S - Ongkir Diteruskan ke Jasa Kirim
  RETURN_SHIPPING: 19,      // T - Ongkos Kirim Pengembalian
  AMS_COMMISSION: 22,       // W - Biaya Komisi AMS
  ADMIN_FEE: 23,            // X - Biaya Administrasi
  SERVICE_FEE: 24,          // Y - Biaya Layanan
  PROCESSING_FEE: 25,       // Z - Biaya Proses Pesanan
  PREMIUM_FEE: 26,          // AA - Premi
  SHIPPING_PROGRAM_FEE: 27, // AB - Biaya Program Hemat Biaya Kirim
  TRANSACTION_FEE: 28,      // AC - Biaya Transaksi
  CAMPAIGN_FEE: 29,         // AD - Biaya Kampanye
  TOTAL_INCOME: 32,         // AG - Total Penghasilan
  VOUCHER_CODE: 33,         // AH - Kode Voucher
  SELLER_FREE_SHIPPING: 35, // AJ - Promo Gratis Ongkir dari Penjual
  SHIPPING_TYPE: 36,        // AK - Jasa Kirim
  COURIER_NAME: 37,         // AL - Nama Kurir
} as const

// Column indices in Order Processing Fee sheet (0-based)
const OPF_COL = {
  ROW_TYPE: 1,              // B - "Order" or "Sku"
  ORDER_NUMBER: 2,          // C - No. Pesanan
  PRODUCT_ID: 3,            // D - ID Produk
  PRODUCT_NAME: 4,          // E - Nama Produk
  PROCESSING_FEE_PRORATA: 6, // G - Biaya Proses Pesanan per Produk (Prorata)
} as const

function parseNum(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value
  const str = String(value).replace(/[^\d.,-]/g, '').replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function pad2(s: string | number): string {
  const v = String(s)
  return v.length === 1 ? `0${v}` : v
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  return `${yyyy}-${mm}-${dd}`
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const parts = s.split('-').map(Number)
  const m = parts[1]
  const d = parts[2]
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  return true
}

function parseShopeeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  // Already a JS Date (from SheetJS cellDates)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return toIsoDate(value)
  }

  // Excel serial number (days since 1899-12-30)
  if (typeof value === 'number' && isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30)
    const d = new Date(excelEpoch + value * 86400000)
    if (!isNaN(d.getTime())) return toIsoDate(d)
    return null
  }

  let str = String(value).trim()
  if (!str) return null

  // Strip time portion if present (anything after space or T)
  str = str.split(/[ T]/)[0]

  // ISO-like: YYYY-MM-DD or YYYY/MM/DD
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const out = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
    return isValidIsoDate(out) ? out : null
  }

  // Day-first: DD-MM-YYYY or DD/MM/YYYY (Indonesian/Shopee format)
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const out = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
    return isValidIsoDate(out) ? out : null
  }

  // Native Date parsing as last resort
  const d = new Date(str)
  if (!isNaN(d.getTime())) return toIsoDate(d)

  return null
}

function parseStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

export function parseShopeeIncome(buffer: Buffer): IncomeParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // --- Income Sheet ---
  const incomeSheet = workbook.Sheets['Income'] ?? workbook.Sheets[workbook.SheetNames[1]]
  if (!incomeSheet) {
    throw new Error('Sheet "Income" tidak ditemukan dalam file XLSX')
  }

  const incomeRows: unknown[][] = XLSX.utils.sheet_to_json(incomeSheet, {
    header: 1,
    defval: null,
    raw: false, // formatted strings for dates
  })

  // Row 5 (index 5) = headers, Row 6+ (index 6+) = data
  const orders: ParsedOrder[] = []
  let periodStart: string | null = null
  let periodEnd: string | null = null

  for (let i = 6; i < incomeRows.length; i++) {
    const row = incomeRows[i]
    if (!row || !row[COL.ORDER_NUMBER]) continue

    const orderNumber = parseStr(row[COL.ORDER_NUMBER])
    if (!orderNumber) continue

    const orderDate = parseShopeeDate(row[COL.ORDER_DATE])
    const releaseDate = parseShopeeDate(row[COL.RELEASE_DATE])

    // Track period range
    if (orderDate) {
      if (!periodStart || orderDate < periodStart) periodStart = orderDate
      if (!periodEnd || orderDate > periodEnd) periodEnd = orderDate
    }

    orders.push({
      order_number: orderNumber,
      buyer_username: parseStr(row[COL.BUYER_USERNAME]),
      buyer_name: parseStr(row[COL.BUYER_NAME]),
      order_date: orderDate,
      release_date: releaseDate,
      payment_method: parseStr(row[COL.PAYMENT_METHOD]),
      original_price: parseNum(row[COL.ORIGINAL_PRICE]),
      product_discount: parseNum(row[COL.PRODUCT_DISCOUNT]),
      refund_amount: parseNum(row[COL.REFUND_AMOUNT]),
      seller_voucher: parseNum(row[COL.SELLER_VOUCHER]),
      seller_voucher_cofund: parseNum(row[COL.SELLER_VOUCHER_COFUND]),
      seller_cashback: parseNum(row[COL.SELLER_CASHBACK]),
      buyer_shipping_fee: parseNum(row[COL.BUYER_SHIPPING]),
      shopee_shipping_subsidy: parseNum(row[COL.SHOPEE_SHIPPING_SUBSIDY]),
      actual_shipping_cost: parseNum(row[COL.ACTUAL_SHIPPING]),
      return_shipping_cost: parseNum(row[COL.RETURN_SHIPPING]),
      ams_commission: parseNum(row[COL.AMS_COMMISSION]),
      admin_fee: parseNum(row[COL.ADMIN_FEE]),
      service_fee: parseNum(row[COL.SERVICE_FEE]),
      processing_fee: parseNum(row[COL.PROCESSING_FEE]),
      premium_fee: parseNum(row[COL.PREMIUM_FEE]),
      shipping_program_fee: parseNum(row[COL.SHIPPING_PROGRAM_FEE]),
      transaction_fee: parseNum(row[COL.TRANSACTION_FEE]),
      campaign_fee: parseNum(row[COL.CAMPAIGN_FEE]),
      total_income: parseNum(row[COL.TOTAL_INCOME]),
      voucher_code: parseStr(row[COL.VOUCHER_CODE]),
      shipping_type: parseStr(row[COL.SHIPPING_TYPE]),
      courier_name: parseStr(row[COL.COURIER_NAME]),
      seller_free_shipping_promo: parseNum(row[COL.SELLER_FREE_SHIPPING]),
    })
  }

  // --- Order Processing Fee Sheet ---
  const opfSheet =
    workbook.Sheets['Order Processing Fee'] ??
    workbook.Sheets[workbook.SheetNames[3]]

  const orderProducts: ParsedOrderProduct[] = []

  if (opfSheet) {
    // Use raw:true so numeric product IDs come back as numbers (avoids "1.23E+10"
    // or "12,345,678" formatting issues that raw:false can produce).
    const opfRows: unknown[][] = XLSX.utils.sheet_to_json(opfSheet, {
      header: 1,
      defval: null,
      raw: true,
    })

    let currentOrderNumber: string | null = null

    // Scan from row 1 onwards (row 0 might be title; we look for "Order"/"Sku" markers)
    for (let i = 1; i < opfRows.length; i++) {
      const row = opfRows[i]
      if (!row) continue

      const rowType = parseStr(row[OPF_COL.ROW_TYPE])?.toLowerCase()

      if (rowType === 'order' || rowType === 'pesanan') {
        // "Order" row — capture order number
        currentOrderNumber = parseStr(row[OPF_COL.ORDER_NUMBER])
      } else if ((rowType === 'sku' || rowType === 'produk') && currentOrderNumber) {
        // "Sku" row — has product ID and name.
        // Normalize product ID: strip thousand-separators / whitespace to ensure
        // it matches the ID stored in master_products (e.g. "24142481111").
        const rawId = row[OPF_COL.PRODUCT_ID]
        const productId = rawId != null
          ? String(rawId).replace(/[,.\s]/g, '').trim() || null
          : null
        if (productId) {
          orderProducts.push({
            order_number: currentOrderNumber,
            marketplace_product_id: productId,
            product_name: parseStr(row[OPF_COL.PRODUCT_NAME]),
            processing_fee_prorata: parseNum(row[OPF_COL.PROCESSING_FEE_PRORATA]),
          })
        }
      }
    }
  }

  return { orders, orderProducts, periodStart, periodEnd }
}
