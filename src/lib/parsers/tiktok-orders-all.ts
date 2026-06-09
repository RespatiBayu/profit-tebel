import * as XLSX from 'xlsx'
import type { OrderProductJson, OrdersAllParseResult, ParsedOrderAll } from './shopee-orders-all'
import { headerIndex, parseDate, parseNum, parseStr, valueAt } from './tiktok-shared'

export function parseTiktokOrdersAll(buffer: Buffer): OrdersAllParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets['OrderSKUList'] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Sheet "OrderSKUList" tidak ditemukan dalam file semua pesanan TikTok')

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  if (rows.length < 3) throw new Error('File semua pesanan TikTok kosong atau tidak ada data pesanan')

  const headers = headerIndex(rows[0])
  const ordersMap = new Map<string, {
    status_pesanan: string | null
    total_pembayaran: number
    seller_voucher: number
    order_date: string | null
    order_complete_date: string | null
    products: OrderProductJson[]
  }>()

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const orderNumber = parseStr(valueAt(row, headers, 'Order ID'))
    if (!orderNumber) continue

    const skuId = parseStr(valueAt(row, headers, 'SKU ID'))
    const productName = parseStr(valueAt(row, headers, 'Product Name'))
    const quantity = Math.max(1, parseInt(String(valueAt(row, headers, 'Quantity') ?? '1'), 10) || 1)
    const hargaAwal = parseNum(valueAt(row, headers, 'SKU Unit Original Price'))
    const hargaDiskon = parseNum(valueAt(row, headers, 'SKU Subtotal After Discount')) / quantity
    const sellerDiscount = parseNum(valueAt(row, headers, 'SKU Seller Discount'))

    if (!ordersMap.has(orderNumber)) {
      ordersMap.set(orderNumber, {
        status_pesanan: parseStr(valueAt(row, headers, 'Order Status')),
        total_pembayaran: parseNum(valueAt(row, headers, 'Order Amount')),
        seller_voucher: 0,
        order_date: parseDate(valueAt(row, headers, 'Created Time')),
        order_complete_date:
          parseDate(valueAt(row, headers, 'Delivered Time')) ??
          parseDate(valueAt(row, headers, 'Cancelled Time')),
        products: [],
      })
    }

    const order = ordersMap.get(orderNumber)!
    order.seller_voucher += sellerDiscount
    order.products.push({
      marketplace_product_id: skuId,
      product_name: productName,
      quantity,
      harga_awal: hargaAwal,
      harga_setelah_diskon: hargaDiskon,
    })
  }

  if (ordersMap.size === 0) {
    throw new Error('Tidak ada data pesanan ditemukan. Pastikan file adalah "Semua pesanan" dari TikTok Shop.')
  }

  let periodStart: string | null = null
  let periodEnd: string | null = null
  const orders: ParsedOrderAll[] = []

  for (const [orderNumber, order] of Array.from(ordersMap.entries())) {
    if (order.order_date) {
      if (!periodStart || order.order_date < periodStart) periodStart = order.order_date
      if (!periodEnd || order.order_date > periodEnd) periodEnd = order.order_date
    }

    orders.push({
      order_number: orderNumber,
      status_pesanan: order.status_pesanan,
      total_pembayaran: order.total_pembayaran,
      seller_voucher: order.seller_voucher,
      order_date: order.order_date,
      order_complete_date: order.order_complete_date,
      products_json: order.products,
    })
  }

  return { orders, periodStart, periodEnd }
}
