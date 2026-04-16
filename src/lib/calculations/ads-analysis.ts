import { ROAS_THRESHOLDS } from '@/lib/constants/marketplace-fees'
import type {
  DbAdsRow,
  MasterProduct,
  ProductProfitRow,
  AdsKpis,
  TrafficLight,
  TrafficLightRow,
  FunnelRow,
  QuadrantPoint,
} from '@/types'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isAggregate(row: DbAdsRow) {
  return row.product_code === '-'
}

/** Classify a product's ad performance */
export function classifyProduct(roas: number, conversions: number): TrafficLight {
  if (roas >= ROAS_THRESHOLDS.scale && conversions >= ROAS_THRESHOLDS.minConversions) {
    return 'scale'
  }
  if (roas < ROAS_THRESHOLDS.kill) {
    return 'kill'
  }
  return 'optimize'
}

// ---------------------------------------------------------------------------
// 1. Aggregate KPIs
// ---------------------------------------------------------------------------

export function calculateAdsOverview(rows: DbAdsRow[]): AdsKpis {
  // Only count products that have actual individual ad spend for KPIs/signals
  const productRows = rows.filter((r) => !isAggregate(r) && r.ad_spend > 0)

  let totalAdSpend = 0
  let totalGmv = 0
  let totalConversions = 0

  for (const r of productRows) {
    totalAdSpend += r.ad_spend
    totalGmv += r.gmv
    totalConversions += r.conversions
  }

  // Add Shop-level aggregate campaigns (e.g. Shop GMV Max) to totals.
  // These are real spend/GMV/conversions but not attributed to a specific product.
  // Including them makes Total Ad Spend match what Shopee reports.
  for (const r of rows.filter(isAggregate)) {
    totalAdSpend += r.ad_spend
    totalGmv += r.gmv
    totalConversions += r.conversions
  }

  const overallRoas = totalAdSpend > 0 ? totalGmv / totalAdSpend : 0
  const avgCpa = totalConversions > 0 ? totalAdSpend / totalConversions : 0

  // Deduplicate by product_code: take the row with highest ad_spend per product
  // (handles multiple periods showing same product)
  const dedupedSignalRows = dedupeByProductCode(productRows)
  const signals = dedupedSignalRows.map((r) => classifyProduct(r.roas, r.conversions))
  const scaleCount = signals.filter((s) => s === 'scale').length
  const optimizeCount = signals.filter((s) => s === 'optimize').length
  const killCount = signals.filter((s) => s === 'kill').length

  return {
    totalAdSpend,
    totalGmv,
    overallRoas,
    totalConversions,
    avgCpa,
    productCount: dedupedSignalRows.length,
    scaleCount,
    optimizeCount,
    killCount,
  }
}

/** Deduplicate rows by product_code — keep the row with the highest ad_spend per product */
function dedupeByProductCode(rows: DbAdsRow[]): DbAdsRow[] {
  const map = new Map<string, DbAdsRow>()
  for (const r of rows) {
    const existing = map.get(r.product_code)
    if (!existing || r.ad_spend > existing.ad_spend) {
      map.set(r.product_code, r)
    }
  }
  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// 2. Traffic Light rows (with optional True ROAS)
// ---------------------------------------------------------------------------

export function buildTrafficLightRows(
  rows: DbAdsRow[],
  masterProducts: MasterProduct[]
): TrafficLightRow[] {
  const hppMap = new Map(
    masterProducts.map((p) => [p.marketplace_product_id, p])
  )

  // Only show products with actual individual ad spend.
  // Products with ad_spend=0 appear in CSV when covered by Shop GMV Max only
  // — their ROAS would always be 0 which gives a false KILL classification.
  // Also dedupe: when "all periods" selected, same product may appear multiple times;
  // keep the row with the highest ad_spend per product.
  const filteredRows = dedupeByProductCode(
    rows.filter((r) => !isAggregate(r) && r.ad_spend > 0)
  )

  return filteredRows
    .map((r) => {
      const signal = classifyProduct(r.roas, r.conversions)
      const product = hppMap.get(r.product_code)

      let trueRoas: number | null = null
      let profitPerUnit: number | null = null

      if (product && (product.hpp > 0 || product.packaging_cost > 0)) {
        const hppTotal = product.hpp + product.packaging_cost
        // True ROAS = (GMV - HPP cost) / Ad Spend
        const unitsSold = r.units_sold || 1
        const totalHppCost = hppTotal * unitsSold
        const netGmv = r.gmv - totalHppCost
        trueRoas = r.ad_spend > 0 ? netGmv / r.ad_spend : 0

        // Profit per unit = (GMV/units) - hpp - packaging
        const avgSellingPrice = unitsSold > 0 ? r.gmv / unitsSold : 0
        profitPerUnit = avgSellingPrice - hppTotal
      }

      return {
        productCode: r.product_code,
        productName: r.product_name ?? r.product_code,
        reportPeriodStart: r.report_period_start,
        impressions: r.impressions,
        clicks: r.clicks,
        conversions: r.conversions,
        unitsSold: r.units_sold,
        gmv: r.gmv,
        adSpend: r.ad_spend,
        roas: r.roas,
        directRoas: r.direct_roas,
        cpa: r.cost_per_conversion,
        ctr: r.ctr,
        conversionRate: r.conversion_rate,
        signal,
        trueRoas,
        profitPerUnit,
      }
    })
    .sort((a, b) => {
      // Sort: SCALE first, then OPTIMIZE, then KILL; within each group by ROAS desc
      const order = { scale: 0, optimize: 1, kill: 2 }
      if (order[a.signal] !== order[b.signal]) return order[a.signal] - order[b.signal]
      return b.roas - a.roas
    })
}

// ---------------------------------------------------------------------------
// 3. Funnel data (top 10 by ad spend for readability)
// ---------------------------------------------------------------------------

export function buildFunnelData(rows: DbAdsRow[]): FunnelRow[] {
  return dedupeByProductCode(rows.filter((r) => !isAggregate(r) && r.ad_spend > 0))
    .sort((a, b) => b.ad_spend - a.ad_spend)
    .slice(0, 10)
    .map((r) => ({
      productName: r.product_name ?? r.product_code,
      productCode: r.product_code,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      ctr: r.ctr,
      conversionRate: r.conversion_rate,
    }))
}

// ---------------------------------------------------------------------------
// 4. Quadrant data (ROAS vs Profit per unit)
// ---------------------------------------------------------------------------

export function buildQuadrantData(
  rows: DbAdsRow[],
  profitRows: ProductProfitRow[]
): QuadrantPoint[] {
  const profitMap = new Map(profitRows.map((p) => [p.productId, p]))

  return dedupeByProductCode(rows.filter((r) => !isAggregate(r) && r.ad_spend > 0))
    .map((r) => {
      const profitRow = profitMap.get(r.product_code)
      const profitPerUnit =
        profitRow && profitRow.hasHpp && profitRow.orderCount > 0
          ? profitRow.profit / profitRow.orderCount
          : null

      if (profitPerUnit === null) return null

      return {
        productCode: r.product_code,
        productName: r.product_name ?? r.product_code,
        roas: r.roas,
        profitPerUnit,
        adSpend: r.ad_spend,
        signal: classifyProduct(r.roas, r.conversions),
      }
    })
    .filter((p): p is QuadrantPoint => p !== null)
}

// ---------------------------------------------------------------------------
// 5. ROAS bar chart data (sorted descending)
// ---------------------------------------------------------------------------

export function buildRoasChartData(rows: DbAdsRow[]) {
  return dedupeByProductCode(rows.filter((r) => !isAggregate(r) && r.ad_spend > 0))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 20) // top 20 for readability
    .map((r) => ({
      name: (r.product_name ?? r.product_code).slice(0, 30),
      roas: r.roas,
      directRoas: r.direct_roas,
      signal: classifyProduct(r.roas, r.conversions),
    }))
}
