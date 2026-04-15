import type {
  DbOrder,
  DbOrderProduct,
  DbAdsRow,
  MasterProduct,
  ProfitKpis,
  FeeBreakdownItem,
  TrendPoint,
  ProductProfitRow,
  PaymentDistItem,
  CourierStatRow,
  CashFlowStats,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Build helper: HPP lookup per product
// ---------------------------------------------------------------------------

export function buildHppMap(
  masterProducts: MasterProduct[]
): Map<string, { hpp: number; packaging_cost: number; name: string }> {
  const map = new Map<string, { hpp: number; packaging_cost: number; name: string }>()
  for (const p of masterProducts) {
    map.set(p.marketplace_product_id, {
      hpp: p.hpp ?? 0,
      packaging_cost: p.packaging_cost ?? 0,
      name: p.product_name,
    })
  }
  return map
}

// Build: order_number → list of product IDs in that order
export function buildOrderProductMap(
  orderProducts: DbOrderProduct[]
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const op of orderProducts) {
    const existing = map.get(op.order_number) ?? []
    existing.push(op.marketplace_product_id)
    map.set(op.order_number, existing)
  }
  return map
}

// Build: product_code → total ad_spend from ads_data
export function buildAdSpendMap(adsData: DbAdsRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const ad of adsData) {
    const existing = map.get(ad.product_code) ?? 0
    map.set(ad.product_code, existing + (ad.ad_spend ?? 0))
  }
  return map
}

// Per-order ad spend cost (sum of all products in order)
function orderAdSpendCost(
  order: DbOrder,
  orderProductMap: Map<string, string[]>,
  adSpendMap: Map<string, number>
): number {
  const productIds = orderProductMap.get(order.order_number) ?? []
  if (productIds.length === 0) return 0
  return productIds.reduce((sum, pid) => {
    // Try to find ad spend by marketplace_product_id (product_code)
    const adSpend = adSpendMap.get(pid) ?? 0
    return sum + adSpend
  }, 0)
}

// Per-order HPP cost (sum of all products in order)
function orderHppCost(
  order: DbOrder,
  orderProductMap: Map<string, string[]>,
  hppMap: Map<string, { hpp: number; packaging_cost: number; name: string }>
): number {
  const productIds = orderProductMap.get(order.order_number) ?? []
  if (productIds.length === 0) return 0
  return productIds.reduce((sum, pid) => {
    const h = hppMap.get(pid)
    return sum + (h ? h.hpp + h.packaging_cost : 0)
  }, 0)
}

// ---------------------------------------------------------------------------
// 1. KPIs
// ---------------------------------------------------------------------------

export function calculateKpis(
  orders: DbOrder[],
  orderProductMap: Map<string, string[]>,
  hppMap: Map<string, { hpp: number; packaging_cost: number; name: string }>,
  adsData: DbAdsRow[] = []
): ProfitKpis {
  const adSpendMap = buildAdSpendMap(adsData)
  let totalOmzet = 0
  let totalNetIncome = 0
  let totalFees = 0
  let totalHppCost = 0
  let totalAdSpend = 0
  let hasHppData = false

  // Check if there's any HPP data globally (for all products)
  // If any product has HPP set, use it for all periods
  const hasAnyGlobalHpp =
    hppMap.size > 0 && Array.from(hppMap.values()).some((h) => h.hpp > 0 || h.packaging_cost > 0)

  for (const o of orders) {
    totalOmzet += o.original_price
    totalNetIncome += o.total_income

    // Shopee reports fees/vouchers as negative values — take abs so "Total Biaya"
    // is always a positive magnitude (matches calculateFeeBreakdown).
    const fees =
      Math.abs(o.ams_commission) +
      Math.abs(o.admin_fee) +
      Math.abs(o.service_fee) +
      Math.abs(o.processing_fee) +
      Math.abs(o.premium_fee) +
      Math.abs(o.shipping_program_fee) +
      Math.abs(o.transaction_fee) +
      Math.abs(o.campaign_fee) +
      Math.abs(o.seller_voucher) +
      Math.abs(o.seller_voucher_cofund) +
      Math.abs(o.seller_cashback) +
      Math.abs(o.seller_free_shipping_promo) +
      Math.max(0, o.actual_shipping_cost - o.buyer_shipping_fee - o.shopee_shipping_subsidy)
    totalFees += fees

    const hpp = orderHppCost(o, orderProductMap, hppMap)
    totalHppCost += hpp
    if (hpp > 0) hasHppData = true

    const adSpend = orderAdSpendCost(o, orderProductMap, adSpendMap)
    totalAdSpend += adSpend
  }

  // If no HPP found in this period but there's global HPP data, still mark as having HPP data
  // This allows Real Profit to be calculated for all periods once HPP is set
  if (!hasHppData && hasAnyGlobalHpp && orders.length > 0) {
    hasHppData = true
  }

  const realProfit = totalNetIncome - totalHppCost - totalAdSpend
  const profitMargin =
    hasHppData && totalOmzet > 0 ? (realProfit / totalOmzet) * 100 : null

  return {
    totalOmzet,
    totalNetIncome,
    totalFees,
    totalHppCost,
    totalAdSpend,
    realProfit,
    profitMargin,
    orderCount: orders.length,
    hasHppData,
  }
}

// ---------------------------------------------------------------------------
// 2. Fee Breakdown
// ---------------------------------------------------------------------------

export function calculateFeeBreakdown(orders: DbOrder[]): FeeBreakdownItem[] {
  let adminFee = 0
  let serviceFee = 0
  let amsCommission = 0
  let processingFee = 0
  let shippingNet = 0
  let sellerVoucher = 0
  let sellerCashback = 0
  let other = 0

  for (const o of orders) {
    adminFee += o.admin_fee
    serviceFee += o.service_fee
    amsCommission += o.ams_commission
    processingFee += o.processing_fee
    shippingNet += Math.max(
      0,
      o.actual_shipping_cost - o.buyer_shipping_fee - o.shopee_shipping_subsidy
    )
    sellerVoucher += o.seller_voucher + o.seller_voucher_cofund
    sellerCashback += o.seller_cashback
    other += o.premium_fee + o.shipping_program_fee + o.transaction_fee + o.campaign_fee + o.seller_free_shipping_promo
  }

  return [
    { name: 'Biaya Admin', value: Math.abs(adminFee), color: '#3b82f6' },
    { name: 'Biaya Layanan', value: Math.abs(serviceFee), color: '#8b5cf6' },
    { name: 'Komisi AMS', value: Math.abs(amsCommission), color: '#f59e0b' },
    { name: 'Biaya Proses', value: Math.abs(processingFee), color: '#10b981' },
    { name: 'Ongkir (nett)', value: Math.abs(shippingNet), color: '#06b6d4' },
    { name: 'Voucher Seller', value: Math.abs(sellerVoucher), color: '#f43f5e' },
    { name: 'Cashback', value: Math.abs(sellerCashback), color: '#ec4899' },
    { name: 'Lainnya', value: Math.abs(other), color: '#94a3b8' },
  ].filter((item) => item.value > 0)
}

// ---------------------------------------------------------------------------
// 3. Trend (daily or weekly)
// ---------------------------------------------------------------------------

export function calculateTrend(
  orders: DbOrder[],
  groupBy: 'day' | 'week',
  orderProductMap: Map<string, string[]>,
  hppMap: Map<string, { hpp: number; packaging_cost: number; name: string }>,
  adsData: DbAdsRow[] = []
): TrendPoint[] {
  const adSpendMap = buildAdSpendMap(adsData)
  const grouped = new Map<
    string,
    { omzet: number; netIncome: number; hpp: number; adSpend: number; hasHpp: boolean }
  >()

  for (const o of orders) {
    if (!o.order_date) continue
    const key = groupBy === 'week' ? weekKey(o.order_date) : o.order_date
    const existing = grouped.get(key) ?? { omzet: 0, netIncome: 0, hpp: 0, adSpend: 0, hasHpp: false }
    const hpp = orderHppCost(o, orderProductMap, hppMap)
    const adSpend = orderAdSpendCost(o, orderProductMap, adSpendMap)
    existing.omzet += o.original_price
    existing.netIncome += o.total_income
    existing.hpp += hpp
    existing.adSpend += adSpend
    if (hpp > 0) existing.hasHpp = true
    grouped.set(key, existing)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      omzet: data.omzet,
      netIncome: data.netIncome,
      profit: data.hasHpp ? data.netIncome - data.hpp - data.adSpend : null,
    }))
}

// ---------------------------------------------------------------------------
// 4. Per-product profit
// ---------------------------------------------------------------------------

export function calculateProductProfit(
  orders: DbOrder[],
  orderProducts: DbOrderProduct[],
  hppMap: Map<string, { hpp: number; packaging_cost: number; name: string }>,
  adsData: DbAdsRow[] = []
): ProductProfitRow[] {
  const adSpendMap = buildAdSpendMap(adsData)

  // Map product → list of contributing orders (with prorated income)
  const productStats = new Map<
    string,
    { name: string; orderCount: number; attributedIncome: number; hppCost: number; adSpend: number; hasHpp: boolean }
  >()

  // Build: order_number → [product IDs]
  const opMap = new Map<string, string[]>()
  for (const op of orderProducts) {
    const list = opMap.get(op.order_number) ?? []
    list.push(op.marketplace_product_id)
    opMap.set(op.order_number, list)
  }

  // For each order, attribute income proportionally to its products
  for (const order of orders) {
    const productIds = opMap.get(order.order_number)
    if (!productIds || productIds.length === 0) continue

    const incomePerProduct = order.total_income / productIds.length

    for (const pid of productIds) {
      const hppInfo = hppMap.get(pid)
      const adSpend = adSpendMap.get(pid) ?? 0
      const existing = productStats.get(pid) ?? {
        name: hppInfo?.name ?? pid,
        orderCount: 0,
        attributedIncome: 0,
        hppCost: 0,
        adSpend: 0,
        hasHpp: false,
      }

      existing.orderCount += 1
      existing.attributedIncome += incomePerProduct
      existing.adSpend += adSpend
      if (hppInfo && (hppInfo.hpp > 0 || hppInfo.packaging_cost > 0)) {
        existing.hppCost += hppInfo.hpp + hppInfo.packaging_cost
        existing.hasHpp = true
      }
      productStats.set(pid, existing)
    }
  }

  return Array.from(productStats.entries()).map(([productId, data]) => {
    const profit = data.attributedIncome - data.hppCost - data.adSpend
    const margin =
      data.hasHpp && data.attributedIncome > 0
        ? (profit / data.attributedIncome) * 100
        : null

    return {
      productId,
      productName: data.name,
      orderCount: data.orderCount,
      attributedIncome: data.attributedIncome,
      totalHppCost: data.hppCost,
      totalAdSpend: data.adSpend,
      profit,
      margin,
      hasHpp: data.hasHpp,
    }
  })
}

// ---------------------------------------------------------------------------
// 5. Cash Flow Gap
// ---------------------------------------------------------------------------

export function calculateCashFlowGap(orders: DbOrder[]): CashFlowStats {
  const gaps: number[] = []

  for (const o of orders) {
    if (o.order_date && o.release_date) {
      const days = daysBetween(o.order_date, o.release_date)
      if (days >= 0 && days < 365) gaps.push(days)
    }
  }

  if (gaps.length === 0) {
    return { avgDays: 0, minDays: 0, maxDays: 0, ordersWithBothDates: 0 }
  }

  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return {
    avgDays: Math.round(avg * 10) / 10,
    minDays: Math.min(...gaps),
    maxDays: Math.max(...gaps),
    ordersWithBothDates: gaps.length,
  }
}

// ---------------------------------------------------------------------------
// 6. Payment Distribution
// ---------------------------------------------------------------------------

export function calculatePaymentDistribution(orders: DbOrder[]): PaymentDistItem[] {
  const map = new Map<string, { count: number; amount: number }>()

  for (const o of orders) {
    const method = o.payment_method ?? 'Tidak Diketahui'
    const existing = map.get(method) ?? { count: 0, amount: 0 }
    existing.count += 1
    existing.amount += o.total_income
    map.set(method, existing)
  }

  return Array.from(map.entries())
    .map(([method, data]) => ({ method, count: data.count, amount: data.amount }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// 7. Courier Stats
// ---------------------------------------------------------------------------

export function calculateCourierStats(orders: DbOrder[]): CourierStatRow[] {
  const map = new Map<string, { orderCount: number; totalCost: number }>()

  for (const o of orders) {
    const courier = o.courier_name ?? 'Tidak Diketahui'
    const existing = map.get(courier) ?? { orderCount: 0, totalCost: 0 }
    existing.orderCount += 1
    existing.totalCost += o.actual_shipping_cost
    map.set(courier, existing)
  }

  return Array.from(map.entries())
    .map(([courier, data]) => ({
      courier,
      orderCount: data.orderCount,
      totalShippingCost: data.totalCost,
      avgShippingCost: data.totalCost / data.orderCount,
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
}
