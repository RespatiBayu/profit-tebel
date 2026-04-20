import { ROAS_THRESHOLDS } from '@/lib/constants/marketplace-fees'
import { PLATFORMS, ROAS_TARGET_MULTIPLIERS } from '@/lib/constants/shopee-fees-2026'
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
// BEP ROAS — mengacu ke Kalkulator ROAS (formula sama)
// ---------------------------------------------------------------------------

/** PPN 11% di atas BEP sebagai batas bawah sebelum KILL. */
export const BEP_PPN_MULTIPLIER = 1.11

/** Default fee preset buat estimasi BEP ROAS di Detail Iklan — pakai Shopee
 *  Star × 'other' (paling umum). User tetap bisa override di Kalkulator ROAS. */
const DEFAULT_ADMIN_RATE = PLATFORMS.shopee.adminFeeMatrix.star.other
const DEFAULT_ONGKIR_RATE = PLATFORMS.shopee.defaults.ongkirExtraRate
const DEFAULT_PROMO_RATE = PLATFORMS.shopee.defaults.promoExtraRate
const DEFAULT_BIAYA_PER_PESANAN = PLATFORMS.shopee.defaults.biayaPerPesanan

/** Hitung BEP ROAS per-unit dari avg harga jual + HPP + fee preset. */
export function calculateBepRoas(
  avgSellingPrice: number,
  hppPerUnit: number,
): number | null {
  if (avgSellingPrice <= 0 || hppPerUnit <= 0) return null
  const totalFeePct = DEFAULT_ADMIN_RATE + DEFAULT_ONGKIR_RATE + DEFAULT_PROMO_RATE
  const totalPajak = avgSellingPrice * totalFeePct + DEFAULT_BIAYA_PER_PESANAN
  const grossProfit = avgSellingPrice - hppPerUnit - totalPajak
  if (grossProfit <= 0) return null
  return avgSellingPrice / grossProfit
}

/** Signal berdasarkan BEP ROAS:
 *   hijau (SCALE):    ROAS ≥ konservatif (2.0× BEP)
 *   kuning (OPTIMIZE): ROAS ≥ BEP × 1.11 (BEP + PPN)
 *   merah (KILL):     ROAS < BEP × 1.11
 *  Kalau BEP null (HPP belum diisi / grossProfit ≤ 0), fallback 'neutral'. */
export function classifyByBepRoas(roas: number, bepRoas: number | null): TrafficLight | 'neutral' {
  if (bepRoas === null || !isFinite(bepRoas)) return 'neutral'
  const scaleThreshold = bepRoas * ROAS_TARGET_MULTIPLIERS.konservatif  // 2.0×
  const killThreshold = bepRoas * BEP_PPN_MULTIPLIER                     // 1.11×
  if (roas >= scaleThreshold) return 'scale'
  if (roas >= killThreshold) return 'optimize'
  return 'kill'
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isAggregate(row: DbAdsRow) {
  return row.product_code === '-'
}

/** Normalize ad_name / parent_iklan for matching: strip trailing ★/* and whitespace. */
function normalizeAdName(name: string | null): string {
  if (!name) return ''
  return name.replace(/[★\*]+/g, '').trim().toLowerCase()
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

export function calculateAdsOverview(
  rows: DbAdsRow[],
  masterProducts: MasterProduct[] = [],
): AdsKpis {
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
  const hppMap = new Map(masterProducts.map((p) => [p.marketplace_product_id, p]))
  const signals = dedupedSignalRows.map((r) => {
    const mp = hppMap.get(r.product_code)
    const hppTotal = mp ? mp.hpp + mp.packaging_cost : 0
    const units = r.units_sold || 0
    const avgPrice = units > 0 ? r.gmv / units : 0
    const bep = calculateBepRoas(avgPrice, hppTotal)
    return classifyByBepRoas(r.roas, bep)
  })
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

/**
 * Deduplicate Format 1 rows by ad_name — keep the row with highest ad_spend per campaign.
 * When "all periods" view is shown, the same campaign may appear for multiple periods;
 * we keep the most recent / highest-spend entry.
 */
function dedupeByCampaign(rows: DbAdsRow[]): DbAdsRow[] {
  const map = new Map<string, DbAdsRow>()
  for (const r of rows) {
    // Key by ad_name if available (Format 1); fall back to product_code (legacy/Format 2)
    const key = r.ad_name ?? r.product_code
    const existing = map.get(key)
    if (!existing || r.ad_spend > existing.ad_spend) {
      map.set(key, r)
    }
  }
  return Array.from(map.values())
}

/** @deprecated Use dedupeByCampaign instead */
function dedupeByProductCode(rows: DbAdsRow[]): DbAdsRow[] {
  return dedupeByCampaign(rows)
}

// ---------------------------------------------------------------------------
// 2. Traffic Light rows (with optional True ROAS)
// ---------------------------------------------------------------------------

export function buildTrafficLightRows(
  rows: DbAdsRow[],
  masterProducts: MasterProduct[],
  /** Optional Format 2 "GMV Max Detail Produk" rows. Dipakai sebagai fallback
   *  untuk hitung True ROAS kalau Format 1 campaign product_code nggak ada di
   *  master_products — lookup via parent_iklan → children → aggregate HPP. */
  adsProductData: DbAdsRow[] = [],
): TrafficLightRow[] {
  const hppMap = new Map(
    masterProducts.map((p) => [p.marketplace_product_id, p])
  )

  // Format 2 child rows: ad_name=null, punya parent_iklan, bukan aggregate.
  // Dipakai untuk agregat HPP per campaign ketika Format 1 product_code nggak
  // cukup untuk lookup langsung. Sumber bisa dari array terpisah (ads page)
  // atau dari `rows` itu sendiri (profit page yang combine).
  const childPool: DbAdsRow[] = [
    ...adsProductData,
    ...rows.filter((r) => r.ad_name === null && r.parent_iklan !== null),
  ].filter((c) => c.product_code !== '-' && c.parent_iklan)

  // Include ALL Format 1 campaign rows (ad_name IS NOT NULL) including the Shop GMV Max
  // aggregate (product_code = '-'). Only filter out rows with zero ad_spend.
  // Dedupe by campaign (ad_name) when "all periods" selected.
  const campaignRows = dedupeByCampaign(
    rows.filter((r) => r.ad_name !== null && r.ad_spend > 0)
  )

  return campaignRows
    .map((r) => {
      let trueRoas: number | null = null
      let profitPerUnit: number | null = null
      let bepRoas: number | null = null
      let avgSellingPriceOut = 0
      let hppPerUnitOut = 0

      // ---- Strategy 1: Direct product_code lookup ----
      // Works kalau Format 1 campaign row's product_code = specific product ID
      // yang ada di master_products (produk tunggal per campaign)
      const direct = isAggregate(r) ? null : hppMap.get(r.product_code)
      if (direct && (direct.hpp > 0 || direct.packaging_cost > 0)) {
        const hppTotal = direct.hpp + direct.packaging_cost
        const unitsSold = r.units_sold || 1
        const totalHppCost = hppTotal * unitsSold
        const netGmv = r.gmv - totalHppCost
        trueRoas = r.ad_spend > 0 ? netGmv / r.ad_spend : 0
        const avgSellingPrice = unitsSold > 0 ? r.gmv / unitsSold : 0
        profitPerUnit = avgSellingPrice - hppTotal
        avgSellingPriceOut = avgSellingPrice
        hppPerUnitOut = hppTotal
      } else if (r.ad_name && childPool.length > 0) {
        // ---- Strategy 2: Fallback via parent_iklan → Format 2 children ----
        // Untuk campaign parent (GMV Max Auto/ROAS) yang cover banyak produk,
        // cari anak produknya di Format 2. Match by parent_iklan == ad_name
        // (normalized) dan same month-year. Sum HPP × units_sold dari tiap anak
        // yang HPP-nya udah diisi di master_products.
        const targetAd = normalizeAdName(r.ad_name)
        const targetMonth = r.report_period_start?.slice(0, 7) ?? null
        let totalHppCost = 0
        let totalUnits = 0
        let matchedChildren = 0
        for (const c of childPool) {
          if (targetMonth) {
            const childMonth = (c.report_period_start ?? '').slice(0, 7)
            if (childMonth !== targetMonth) continue
          }
          const pi = normalizeAdName(c.parent_iklan)
          if (!pi) continue
          if (!(pi === targetAd || pi.includes(targetAd) || targetAd.includes(pi))) continue
          const mp = hppMap.get(c.product_code)
          if (!mp || (mp.hpp <= 0 && mp.packaging_cost <= 0)) continue
          const hppPerUnit = mp.hpp + mp.packaging_cost
          const units = c.units_sold || 0
          totalHppCost += hppPerUnit * units
          totalUnits += units
          matchedChildren += 1
        }
        if (matchedChildren > 0 && r.ad_spend > 0) {
          trueRoas = (r.gmv - totalHppCost) / r.ad_spend
          const avgPrice = totalUnits > 0 ? r.gmv / totalUnits : 0
          const avgHpp = totalUnits > 0 ? totalHppCost / totalUnits : 0
          profitPerUnit = avgPrice - avgHpp
          avgSellingPriceOut = avgPrice
          hppPerUnitOut = avgHpp
        }
      }

      // BEP ROAS (mengacu ke Kalkulator ROAS) + signal baru
      bepRoas = calculateBepRoas(avgSellingPriceOut, hppPerUnitOut)
      const signal = classifyByBepRoas(r.roas, bepRoas)

      return {
        adName: r.ad_name,
        productCode: r.product_code,
        productName: r.product_name ?? r.ad_name ?? r.product_code,
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
        bepRoas,
      }
    })
    .sort((a, b) => {
      // Sort: SCALE first, then OPTIMIZE, then NEUTRAL, then KILL; within each group by ROAS desc
      const order: Record<string, number> = { scale: 0, optimize: 1, neutral: 2, kill: 3 }
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
  profitRows: ProductProfitRow[],
  masterProducts: MasterProduct[] = [],
): QuadrantPoint[] {
  const profitMap = new Map(profitRows.map((p) => [p.productId, p]))
  const hppMap = new Map(masterProducts.map((p) => [p.marketplace_product_id, p]))

  return dedupeByProductCode(rows.filter((r) => !isAggregate(r) && r.ad_spend > 0))
    .map((r) => {
      const profitRow = profitMap.get(r.product_code)
      const profitPerUnit =
        profitRow && profitRow.hasHpp && profitRow.orderCount > 0
          ? profitRow.profit / profitRow.orderCount
          : null

      if (profitPerUnit === null) return null

      const mp = hppMap.get(r.product_code)
      const hppTotal = mp ? mp.hpp + mp.packaging_cost : 0
      const units = r.units_sold || 0
      const avgPrice = units > 0 ? r.gmv / units : 0
      const bep = calculateBepRoas(avgPrice, hppTotal)
      const s = classifyByBepRoas(r.roas, bep)
      const signal: TrafficLight = s === 'neutral' ? 'optimize' : s

      return {
        productCode: r.product_code,
        productName: r.product_name ?? r.product_code,
        roas: r.roas,
        profitPerUnit,
        adSpend: r.ad_spend,
        signal,
      }
    })
    .filter((p): p is QuadrantPoint => p !== null)
}

// ---------------------------------------------------------------------------
// 5. ROAS bar chart data (sorted descending)
// ---------------------------------------------------------------------------

export function buildRoasChartData(rows: DbAdsRow[], masterProducts: MasterProduct[] = []) {
  const hppMap = new Map(masterProducts.map((p) => [p.marketplace_product_id, p]))
  return dedupeByProductCode(rows.filter((r) => !isAggregate(r) && r.ad_spend > 0))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 20) // top 20 for readability
    .map((r) => {
      const mp = hppMap.get(r.product_code)
      const hppTotal = mp ? mp.hpp + mp.packaging_cost : 0
      const units = r.units_sold || 0
      const avgPrice = units > 0 ? r.gmv / units : 0
      const bep = calculateBepRoas(avgPrice, hppTotal)
      const s = classifyByBepRoas(r.roas, bep)
      const signal: TrafficLight = s === 'neutral' ? 'optimize' : s
      return {
        name: (r.product_name ?? r.product_code).slice(0, 30),
        roas: r.roas,
        directRoas: r.direct_roas,
        bepRoas: bep,
        signal,
      }
    })
}
