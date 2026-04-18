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

/** Keep only Format 1 rows ("Summary per Iklan" — ad_name IS NOT NULL).
 *  Format 2 per-produk rows are the breakdown of the same Shop GMV Max
 *  campaigns already counted in Format 1, so summing both double-counts
 *  ad spend. Ads-Analisis dashboard uses Format 1 as the source of truth
 *  for "Total Ad Spend" — Analisis Profit must match. */
function summaryRowsOnly(adsData: DbAdsRow[]): DbAdsRow[] {
  return adsData.filter((ad) => ad.ad_name !== null)
}

// Build: product_code → total ad_spend from ads_data (Summary/Format 1 only)
export function buildAdSpendMap(adsData: DbAdsRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const ad of summaryRowsOnly(adsData)) {
    const existing = map.get(ad.product_code) ?? 0
    map.set(ad.product_code, existing + (ad.ad_spend ?? 0))
  }
  return map
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
  let totalOmzet = 0
  let totalNetIncome = 0
  let totalFees = 0
  let totalHppCost = 0
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
  }

  // Ad spend is independent of orders — sum directly from Summary per Iklan
  // (Format 1) rows only. Format 2 per-produk rows are the breakdown of the
  // same campaigns and would double-count. This keeps Analisis Profit in
  // sync with the "Total Ad Spend" shown on the Analisis Iklan dashboard.
  let totalAdSpend = 0
  for (const ad of summaryRowsOnly(adsData)) {
    totalAdSpend += ad.ad_spend ?? 0
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

// Distribute each ads row's ad_spend evenly across the days in its report period.
// Only Format 1 (Summary per Iklan) rows are counted — see summaryRowsOnly note.
function buildDailyAdSpend(adsData: DbAdsRow[]): Map<string, number> {
  const map = new Map<string, number>() // ISO date → total ad_spend for that day
  for (const ad of summaryRowsOnly(adsData)) {
    const amount = ad.ad_spend ?? 0
    if (!amount) continue
    const start = ad.report_period_start
    const end = ad.report_period_end
    if (!start || !end) continue
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    if (days < 1) continue
    const perDay = amount / days
    const cursor = new Date(startDate)
    for (let i = 0; i < days; i++) {
      const key = cursor.toISOString().split('T')[0]
      map.set(key, (map.get(key) ?? 0) + perDay)
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return map
}

export function calculateTrend(
  orders: DbOrder[],
  groupBy: 'day' | 'week',
  orderProductMap: Map<string, string[]>,
  hppMap: Map<string, { hpp: number; packaging_cost: number; name: string }>,
  adsData: DbAdsRow[] = []
): TrendPoint[] {
  const grouped = new Map<
    string,
    { omzet: number; netIncome: number; hpp: number; adSpend: number; hasHpp: boolean }
  >()

  // Accumulate order-driven metrics
  for (const o of orders) {
    if (!o.order_date) continue
    const key = groupBy === 'week' ? weekKey(o.order_date) : o.order_date
    const existing = grouped.get(key) ?? { omzet: 0, netIncome: 0, hpp: 0, adSpend: 0, hasHpp: false }
    const hpp = orderHppCost(o, orderProductMap, hppMap)
    existing.omzet += o.original_price
    existing.netIncome += o.total_income
    existing.hpp += hpp
    if (hpp > 0) existing.hasHpp = true
    grouped.set(key, existing)
  }

  // Add ad_spend independently (ads happen regardless of whether orders occur that day)
  const dailyAdSpend = buildDailyAdSpend(adsData)
  for (const [date, amount] of Array.from(dailyAdSpend.entries())) {
    const key = groupBy === 'week' ? weekKey(date) : date
    const existing = grouped.get(key) ?? { omzet: 0, netIncome: 0, hpp: 0, adSpend: 0, hasHpp: false }
    existing.adSpend += amount
    grouped.set(key, existing)
  }

  // Use global-HPP fallback for profit display: once any product has HPP, include adSpend
  // impact on profit for all periods (profit may be approximate if order_products missing).
  const hasAnyGlobalHpp =
    hppMap.size > 0 && Array.from(hppMap.values()).some((h) => h.hpp > 0 || h.packaging_cost > 0)

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      omzet: data.omzet,
      netIncome: data.netIncome,
      profit:
        data.hasHpp || hasAnyGlobalHpp
          ? data.netIncome - data.hpp - data.adSpend
          : null,
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
      if (hppInfo && (hppInfo.hpp > 0 || hppInfo.packaging_cost > 0)) {
        existing.hppCost += hppInfo.hpp + hppInfo.packaging_cost
        existing.hasHpp = true
      }
      productStats.set(pid, existing)
    }
  }

  // Assign ad_spend once per product (not per-order — avoid double-counting).
  // Also ensure products that only appear in ads (no orders yet) still show up.
  for (const [pid, adSpend] of Array.from(adSpendMap.entries())) {
    const existing = productStats.get(pid)
    if (existing) {
      existing.adSpend = adSpend
    } else {
      // Product has ads but no orders — include it so user can see ad waste
      const hppInfo = hppMap.get(pid)
      productStats.set(pid, {
        name: hppInfo?.name ?? pid,
        orderCount: 0,
        attributedIncome: 0,
        hppCost: 0,
        adSpend,
        hasHpp: !!hppInfo && (hppInfo.hpp > 0 || hppInfo.packaging_cost > 0),
      })
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
