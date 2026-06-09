import * as XLSX from 'xlsx'
import type { IncomeParseResult, ParsedOrder, ParsedOrderProduct } from '@/types'
import { headerIndex, parseDate, parseNum, parseStr, valueAt } from './tiktok-shared'

function parseProductDetails(value: unknown): ParsedOrderProduct[] {
  const text = parseStr(value)
  if (!text || text === '/') return []

  return text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)\s*\*\s*(\d+)/)
      const productId = match?.[1]?.trim() ?? part.trim()
      const qty = Math.max(1, parseInt(match?.[2] ?? '1', 10) || 1)
      return Array.from({ length: qty }, () => ({
        order_number: '',
        marketplace_product_id: productId,
        product_name: null,
        processing_fee_prorata: 0,
      }))
    })
    .flat()
}

export function parseTiktokIncome(buffer: Buffer): IncomeParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets['Detail pesanan'] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Sheet "Detail pesanan" tidak ditemukan dalam file income TikTok')

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 2) throw new Error('File income TikTok kosong atau tidak ada data pesanan')

  const headers = headerIndex(rows[0])
  const orders: ParsedOrder[] = []
  const orderProducts: ParsedOrderProduct[] = []
  let periodStart: string | null = null
  let periodEnd: string | null = null

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const transactionType = parseStr(valueAt(row, headers, 'Jenis transaksi'))
    if (transactionType !== 'Pesanan') continue

    const orderNumber = parseStr(valueAt(row, headers, 'ID pesanan terkait')) ??
      parseStr(valueAt(row, headers, 'ID Pesanan/Penyesuaian'))
    if (!orderNumber || orderNumber === '/') continue

    const orderDate = parseDate(valueAt(row, headers, 'Waktu pemesanan'))
    const releaseDate = parseDate(valueAt(row, headers, 'Waktu pembayaran pesanan'))

    if (orderDate) {
      if (!periodStart || orderDate < periodStart) periodStart = orderDate
      if (!periodEnd || orderDate > periodEnd) periodEnd = orderDate
    }

    orders.push({
      order_number: orderNumber,
      buyer_username: null,
      buyer_name: null,
      order_date: orderDate,
      release_date: releaseDate,
      payment_method: null,
      original_price: parseNum(valueAt(row, headers, 'Subtotal sebelum diskon')),
      product_discount: parseNum(valueAt(row, headers, 'Diskon penjual')),
      refund_amount: parseNum(valueAt(row, headers, 'Subtotal pengembalian dana setelah diskon penjual')),
      seller_voucher: parseNum(valueAt(row, headers, 'Diskon voucher yang ditanggung penjual')),
      seller_voucher_cofund: parseNum(valueAt(row, headers, 'Pengembalian dana diskon voucher yang ditanggung penjual')),
      seller_cashback: 0,
      buyer_shipping_fee: parseNum(valueAt(row, headers, 'Ongkir yang ditanggung pembeli')),
      shopee_shipping_subsidy: parseNum(valueAt(row, headers, 'Ongkir yang ditanggung platform')),
      actual_shipping_cost: parseNum(valueAt(row, headers, 'Ongkir yang ditalangi penyedia jasa logistik')),
      return_shipping_cost:
        parseNum(valueAt(row, headers, 'Ongkir pengembalian barang (yang ditanggung pembeli)')) +
        parseNum(valueAt(row, headers, 'Ongkir pengembalian barang karena kesalahan pembeli')),
      ams_commission:
        parseNum(valueAt(row, headers, 'Komisi Afiliasi')) +
        parseNum(valueAt(row, headers, 'Komisi mitra afiliasi')) +
        parseNum(valueAt(row, headers, 'Komisi Iklan Toko afiliasi')) +
        parseNum(valueAt(row, headers, 'Komisi iklan toko Mitra Afiliasi')),
      admin_fee:
        parseNum(valueAt(row, headers, 'Biaya komisi platform')) +
        parseNum(valueAt(row, headers, 'Komisi dinamis')),
      service_fee:
        parseNum(valueAt(row, headers, 'Biaya layanan Mall')) +
        parseNum(valueAt(row, headers, 'Biaya layanan pre-order')) +
        parseNum(valueAt(row, headers, 'Biaya layanan khusus platform')),
      processing_fee: parseNum(valueAt(row, headers, 'Biaya pemrosesan pesanan')),
      premium_fee:
        parseNum(valueAt(row, headers, 'Biaya asuransi')) +
        parseNum(valueAt(row, headers, 'Penggantian dana asuransi')),
      shipping_program_fee:
        parseNum(valueAt(row, headers, 'Biaya layanan Program Bebas Ongkir')) +
        parseNum(valueAt(row, headers, 'Biaya layanan logistik')) +
        parseNum(valueAt(row, headers, 'Biaya pengiriman sesuai jarak dari Program Horison+')),
      transaction_fee:
        parseNum(valueAt(row, headers, 'Biaya Pembayaran')) +
        parseNum(valueAt(row, headers, 'Credit card installment - Handling fee')) +
        parseNum(valueAt(row, headers, 'Biaya program PayLater')),
      campaign_fee:
        parseNum(valueAt(row, headers, 'Biaya sumber daya campaign')) +
        parseNum(valueAt(row, headers, 'Biaya layanan Brands Crazy Deal/Flash Sale')) +
        parseNum(valueAt(row, headers, 'Biaya iklan GMV Max')),
      total_income: parseNum(valueAt(row, headers, 'Jumlah penyelesaian pembayaran')),
      voucher_code: null,
      shipping_type: parseStr(valueAt(row, headers, 'Sumber pesanan')),
      courier_name: null,
      seller_free_shipping_promo: parseNum(valueAt(row, headers, 'Diskon ongkir dari penjual')),
    })

    for (const product of parseProductDetails(valueAt(row, headers, 'Detail produk terjual'))) {
      orderProducts.push({ ...product, order_number: orderNumber })
    }
  }

  return { orders, orderProducts, periodStart, periodEnd }
}
