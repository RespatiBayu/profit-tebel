import type { DbOrder, DbOrderProduct, MasterProduct } from '@/types'

// ---------------------------------------------------------------------------
// Dashboard extras: busy-days, top products, top buyers, daily detail.
// ---------------------------------------------------------------------------

// Indonesian day names — consistent with dashboard locale.
const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

export interface BusyDayRow {
  dayIndex: number  // 0 = Minggu, 6 = Sabtu
  dayName: string
  orderCount: number
  omzet: number
  netIncome: number
  avgOrderValue: number
}

/** Aggregate orders by day-of-week. Shows which day traffic is busy — useful
 *  for planning ads schedule & stock prep. */
export function calculateBusyDays(orders: DbOrder[]): BusyDayRow[] {
  const buckets = new Map<number, { count: number; omzet: number; net: number }>()
  for (const o of orders) {
    if (!o.order_date) continue
    const d = new Date(o.order_date)
    if (isNaN(d.getTime())) continue
    const idx = d.getDay()
    const b = buckets.get(idx) ?? { count: 0, omzet: 0, net: 0 }
    b.count += 1
    b.omzet += o.original_price
    b.net += o.total_income
    buckets.set(idx, b)
  }

  // Always emit all 7 days (even if 0) so chart x-axis is stable.
  const rows: BusyDayRow[] = []
  for (let i = 0; i < 7; i++) {
    const b = buckets.get(i) ?? { count: 0, omzet: 0, net: 0 }
    rows.push({
      dayIndex: i,
      dayName: DAY_NAMES_ID[i],
      orderCount: b.count,
      omzet: b.omzet,
      netIncome: b.net,
      avgOrderValue: b.count > 0 ? b.omzet / b.count : 0,
    })
  }
  // Reorder Mon-Sun (Shopee sellers think weekdays first).
  return [rows[1], rows[2], rows[3], rows[4], rows[5], rows[6], rows[0]]
}

// ---------------------------------------------------------------------------
// Top Products (by omzet/profit)
// ---------------------------------------------------------------------------

export interface TopProductRow {
  productId: string
  productName: string
  orderCount: number
  unitsSold: number
  omzet: number
  netIncome: number
  hppTotal: number
  profit: number
  margin: number  // percentage
  hasHpp: boolean
}

/** Top N products by omzet across the filtered orders.
 *  Uses order_products mapping to attribute per-product contributions. */
export function calculateTopProducts(
  orders: DbOrder[],
  orderProducts: DbOrderProduct[],
  masterProducts: MasterProduct[],
  limit: number = 5,
): TopProductRow[] {
  const orderByNumber = new Map<string, DbOrder>()
  for (const o of orders) orderByNumber.set(o.order_number, o)

  const productMap = new Map<string, MasterProduct>()
  for (const mp of masterProducts) productMap.set(mp.marketplace_product_id, mp)

  // Group order_products by order_number to prorate income per product
  const byOrder = new Map<string, DbOrderProduct[]>()
  for (const op of orderProducts) {
    if (!orderByNumber.has(op.order_number)) continue
    const list = byOrder.get(op.order_number) ?? []
    list.push(op)
    byOrder.set(op.order_number, list)
  }

  const productStats = new Map<string, TopProductRow>()
  for (const [orderNumber, ops] of Array.from(byOrder.entries())) {
    const order = orderByNumber.get(orderNumber)
    if (!order) continue
    const share = 1 / ops.length
    const proratedOmzet = order.original_price * share
    const proratedNet = order.total_income * share

    for (const op of ops) {
      const mp = productMap.get(op.marketplace_product_id)
      const name = mp?.product_name ?? op.product_name ?? op.marketplace_product_id
      const hppPerUnit = mp ? (mp.hpp + mp.packaging_cost) : 0
      const existing = productStats.get(op.marketplace_product_id) ?? {
        productId: op.marketplace_product_id,
        productName: name,
        orderCount: 0,
        unitsSold: 0,
        omzet: 0,
        netIncome: 0,
        hppTotal: 0,
        profit: 0,
        margin: 0,
        hasHpp: hppPerUnit > 0,
      }
      existing.orderCount += 1
      existing.unitsSold += 1  // order_products doesn't carry qty — treat each row as 1 unit
      existing.omzet += proratedOmzet
      existing.netIncome += proratedNet
      existing.hppTotal += hppPerUnit
      productStats.set(op.marketplace_product_id, existing)
    }
  }

  const rows = Array.from(productStats.values()).map((r) => {
    const profit = r.netIncome - r.hppTotal
    return {
      ...r,
      profit,
      margin: r.omzet > 0 ? (profit / r.omzet) * 100 : 0,
    }
  })

  return rows.sort((a, b) => b.omzet - a.omzet).slice(0, limit)
}

// ---------------------------------------------------------------------------
// Top Buyers
// ---------------------------------------------------------------------------

export interface TopBuyerRow {
  buyerUsername: string
  buyerName: string | null
  orderCount: number
  totalOmzet: number
  avgOrderValue: number
}

/** Top N buyers by total omzet. Buyers without username are grouped as "Unknown". */
export function calculateTopBuyers(
  orders: DbOrder[],
  limit: number = 5,
): TopBuyerRow[] {
  const byBuyer = new Map<string, {
    username: string
    name: string | null
    count: number
    omzet: number
  }>()

  for (const o of orders) {
    if (!o.buyer_username) continue
    const key = o.buyer_username
    const existing = byBuyer.get(key) ?? {
      username: key,
      name: o.buyer_name ?? null,
      count: 0,
      omzet: 0,
    }
    existing.count += 1
    existing.omzet += o.original_price
    // Keep the latest non-null buyer_name seen
    if (!existing.name && o.buyer_name) existing.name = o.buyer_name
    byBuyer.set(key, existing)
  }

  return Array.from(byBuyer.values())
    .map((b) => ({
      buyerUsername: b.username,
      buyerName: b.name,
      orderCount: b.count,
      totalOmzet: b.omzet,
      avgOrderValue: b.count > 0 ? b.omzet / b.count : 0,
    }))
    .sort((a, b) => b.totalOmzet - a.totalOmzet)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Daily Detail — per-tanggal breakdown for the table
// ---------------------------------------------------------------------------

export interface DailyDetailRow {
  date: string          // ISO yyyy-mm-dd
  orderCount: number
  omzet: number         // original price (harga asli)
  discount: number      // voucher + cashback (absolute)
  netIncome: number     // total_income from Shopee
  adminFee: number      // admin + transaction (abs)
  serviceFee: number    // service + premium + shipping program (abs)
  deductionPct: number  // (omzet - netIncome) / omzet
  isBusy: boolean       // order count above median
}

/** Per-day aggregation. Matches the reference screenshot from user:
 *  Tanggal | Order | Harga Asli | Diskon | Penghasilan Bersih | Biaya Admin | Biaya Layanan | % Potongan */
export function calculateDailyDetail(orders: DbOrder[]): DailyDetailRow[] {
  const byDate = new Map<string, DailyDetailRow>()
  for (const o of orders) {
    if (!o.order_date) continue
    const existing = byDate.get(o.order_date) ?? {
      date: o.order_date,
      orderCount: 0,
      omzet: 0,
      discount: 0,
      netIncome: 0,
      adminFee: 0,
      serviceFee: 0,
      deductionPct: 0,
      isBusy: false,
    }
    existing.orderCount += 1
    existing.omzet += o.original_price
    existing.discount +=
      Math.abs(o.seller_voucher) +
      Math.abs(o.seller_voucher_cofund) +
      Math.abs(o.seller_cashback) +
      Math.abs(o.seller_free_shipping_promo) +
      Math.abs(o.product_discount)
    existing.netIncome += o.total_income
    existing.adminFee +=
      Math.abs(o.admin_fee) + Math.abs(o.transaction_fee)
    existing.serviceFee +=
      Math.abs(o.service_fee) +
      Math.abs(o.premium_fee) +
      Math.abs(o.shipping_program_fee) +
      Math.abs(o.campaign_fee) +
      Math.abs(o.ams_commission)
    byDate.set(o.order_date, existing)
  }

  const rows = Array.from(byDate.values()).map((r) => ({
    ...r,
    deductionPct: r.omzet > 0 ? (r.omzet - r.netIncome) / r.omzet : 0,
  }))

  // Mark "busy" days: top 25% by order count
  const sortedCounts = [...rows].map((r) => r.orderCount).sort((a, b) => b - a)
  const q1Threshold = sortedCounts[Math.floor(sortedCounts.length * 0.25)] ?? 0
  for (const r of rows) r.isBusy = r.orderCount >= q1Threshold && r.orderCount > 0

  // Sort most-recent first
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}
