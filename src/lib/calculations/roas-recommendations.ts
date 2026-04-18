import { MARKETPLACE_FEES } from '@/lib/constants/marketplace-fees'
import type { MasterProduct, TrafficLightRow } from '@/types'

// ---------------------------------------------------------------------------
// ROAS Recommendation Engine
// ---------------------------------------------------------------------------
// Based on the seller's own "Analisa ROAS" spreadsheet framework:
//
//   Gross Profit = Harga Jual - HPP - (biaya_per_pesanan + admin% + ongkir_extra%
//                                      + promo_extra%) × Harga Jual
//   BEP ROAS    = Harga Jual / Gross Profit   (break-even — rugi di bawah sini)
//   Kompetitif  = BEP × 1.70                  (agresif scale, tipis margin)
//   Konservatif = BEP × 2.00                  (scale aman, margin nyaman)
//   Prospektif  = BEP × 4.00                  (target premium, margin tebal)
//
// Use case: Ketika seller mau migrate campaign Shop GMV Max Auto → Shop GMV Max
// ROAS, mereka butuh set a `targetRoas`. Angka yang tepat: minimal di atas
// Kompetitif (agar aman) dan di bawah current ROAS × sedikit (agar algoritma
// masih mau spend aggressively).
// ---------------------------------------------------------------------------

/** Fee profile that drives the breakeven calc. Defaults match the user's
 *  "Analisa ROAS Banyuwangi" spreadsheet. User-configurable via settings. */
export interface FeeProfile {
  processingFeePerOrder: number // biaya proses pesanan (Rp flat per order)
  adminFeeRate: number          // 8.25% for Shopee Mall/Star+
  shippingExtraRate: number     // 4% ongkir extra (gratis ongkir seller)
  promoExtraRate: number        // 4.5% promo extra
}

export const DEFAULT_FEE_PROFILE: FeeProfile = {
  processingFeePerOrder: MARKETPLACE_FEES.shopee.processingFee, // 1250
  adminFeeRate: MARKETPLACE_FEES.shopee.adminFeeRate,           // 0.0825
  shippingExtraRate: MARKETPLACE_FEES.shopee.amsCommissionRate, // 0.04
  promoExtraRate: MARKETPLACE_FEES.shopee.serviceFeeRate,       // 0.045
}

export interface RoasTargets {
  sellingPrice: number
  hpp: number
  packagingCost: number
  grossProfit: number        // Harga Jual - HPP - fees (Rp per unit)
  grossProfitPct: number     // grossProfit / sellingPrice (0..1)
  bepRoas: number            // breakeven — anything below = rugi
  kompetitifRoas: number     // BEP × 1.70 — aggressive scale
  konservatifRoas: number    // BEP × 2.00 — safe scale
  prospektifRoas: number     // BEP × 4.00 — premium margin
  /** Totalin fees (Rp) per 1 unit produk, termasuk biaya per pesanan. */
  totalFeesPerUnit: number
}

/** Compute BEP + 3 target ROAS tiers for one product.
 *  sellingPrice must be passed explicitly — master_products doesn't track it,
 *  so callers derive it from ads GMV/unitsSold or order original_price/qty. */
export function computeRoasTargets(
  product: Pick<MasterProduct, 'hpp' | 'packaging_cost'>,
  sellingPrice: number,
  fees: FeeProfile = DEFAULT_FEE_PROFILE,
): RoasTargets | null {
  const hpp = product.hpp ?? 0
  const packagingCost = product.packaging_cost ?? 0
  if (sellingPrice <= 0) return null

  // Percentage fees are levied on the selling price (Shopee deducts from gross)
  const percentFees =
    sellingPrice *
    (fees.adminFeeRate + fees.shippingExtraRate + fees.promoExtraRate)
  const totalFeesPerUnit = percentFees + fees.processingFeePerOrder

  const grossProfit = sellingPrice - hpp - packagingCost - totalFeesPerUnit
  const grossProfitPct = sellingPrice > 0 ? grossProfit / sellingPrice : 0

  // BEP: selling price / gross profit per unit (classic ROAS breakeven)
  const bepRoas = grossProfit > 0 ? sellingPrice / grossProfit : Infinity

  return {
    sellingPrice,
    hpp,
    packagingCost,
    grossProfit,
    grossProfitPct,
    bepRoas,
    kompetitifRoas: bepRoas * 1.7,
    konservatifRoas: bepRoas * 2.0,
    prospektifRoas: bepRoas * 4.0,
    totalFeesPerUnit,
  }
}

// ---------------------------------------------------------------------------
// Scaling decision per campaign
// ---------------------------------------------------------------------------

export type ScaleDecision =
  | 'scale_ready'        // ROAS sekarang di atas Kompetitif → aman di-scale
  | 'scale_with_target'  // ROAS sekarang > BEP tapi < Kompetitif → bisa scale kalau set target yg tepat
  | 'optimize_first'     // ROAS sekarang <= BEP → jangan scale dulu
  | 'insufficient_data'  // HPP/selling_price belum di-set

export interface CampaignScaleRec {
  adName: string | null
  productCode: string
  productName: string
  currentRoas: number
  trueRoas: number | null
  adSpend: number
  conversions: number
  gmv: number
  decision: ScaleDecision
  targets: RoasTargets | null
  /** Target ROAS yang direkomendasikan untuk campaign GMV Max ROAS. */
  recommendedRoasTarget: number | null
  /** Penjelasan satu kalimat Indonesian untuk ditampilkan ke user. */
  reasoning: string
  /** Proyeksi: jika seller naikkan spend 1.5x dengan mempertahankan target ROAS. */
  projectedGmv: number | null
  projectedProfit: number | null
}

/** Attach scale recommendations to traffic-light rows. Rows without a matching
 *  master product (no HPP/selling price) get decision = 'insufficient_data'. */
export function buildScaleRecommendations(
  trafficRows: TrafficLightRow[],
  masterProducts: MasterProduct[],
  fees: FeeProfile = DEFAULT_FEE_PROFILE,
): CampaignScaleRec[] {
  const productByCode = new Map<string, MasterProduct>()
  for (const mp of masterProducts) {
    if (mp.marketplace_product_id) productByCode.set(mp.marketplace_product_id, mp)
  }

  return trafficRows.map((row) => {
    const product = productByCode.get(row.productCode)
    // Derive selling price from ads GMV/unitsSold (most reliable — actual
    // realized price net of voucher). Falls back to 0 if no units sold.
    const avgSellingPrice =
      row.unitsSold > 0 ? row.gmv / row.unitsSold : 0
    const targets = product
      ? computeRoasTargets(product, avgSellingPrice, fees)
      : null

    if (!targets || targets.grossProfit <= 0) {
      return {
        adName: row.adName,
        productCode: row.productCode,
        productName: row.productName,
        currentRoas: row.roas,
        trueRoas: row.trueRoas,
        adSpend: row.adSpend,
        conversions: row.conversions,
        gmv: row.gmv,
        decision: 'insufficient_data',
        targets: null,
        recommendedRoasTarget: null,
        reasoning: product
          ? 'HPP terlalu tinggi — produk rugi bahkan tanpa ads. Cek harga jual & HPP.'
          : 'Set HPP & harga jual produk dulu di Master Produk.',
        projectedGmv: null,
        projectedProfit: null,
      }
    }

    let decision: ScaleDecision
    let recommendedRoasTarget: number | null
    let reasoning: string

    if (row.roas <= targets.bepRoas) {
      decision = 'optimize_first'
      recommendedRoasTarget = null
      reasoning = `ROAS sekarang ${row.roas.toFixed(2)}x masih di bawah BEP ${targets.bepRoas.toFixed(2)}x — rugi kalau di-scale. Optimize dulu.`
    } else if (row.roas >= targets.kompetitifRoas) {
      // Above competitive target — safe to scale. Set GMV Max ROAS slightly
      // below current to give algo headroom to spend more aggressively.
      decision = 'scale_ready'
      recommendedRoasTarget = Math.max(
        targets.kompetitifRoas,       // floor: never below Kompetitif
        row.roas * 0.9,                // 10% headroom below current
      )
      reasoning = `ROAS ${row.roas.toFixed(2)}x di atas target Kompetitif ${targets.kompetitifRoas.toFixed(2)}x. Set target ${recommendedRoasTarget.toFixed(2)}x di GMV Max ROAS untuk scale reach.`
    } else {
      // Between BEP and Kompetitif — scale possible tapi target harus hati-hati.
      decision = 'scale_with_target'
      recommendedRoasTarget = targets.kompetitifRoas
      reasoning = `ROAS ${row.roas.toFixed(2)}x masih di bawah Kompetitif ${targets.kompetitifRoas.toFixed(2)}x. Set target ${targets.kompetitifRoas.toFixed(2)}x — kalau tercapai baru scale.`
    }

    // Projection: current spend × 1.5 under the recommended target
    const projSpend = row.adSpend * 1.5
    const projectedGmv = recommendedRoasTarget
      ? projSpend * recommendedRoasTarget
      : null
    const unitsProjected = projectedGmv
      ? projectedGmv / targets.sellingPrice
      : 0
    const projectedProfit = projectedGmv
      ? projectedGmv - unitsProjected * (targets.hpp + targets.packagingCost) -
        unitsProjected * targets.totalFeesPerUnit - projSpend
      : null

    return {
      adName: row.adName,
      productCode: row.productCode,
      productName: row.productName,
      currentRoas: row.roas,
      trueRoas: row.trueRoas,
      adSpend: row.adSpend,
      conversions: row.conversions,
      gmv: row.gmv,
      decision,
      targets,
      recommendedRoasTarget,
      reasoning,
      projectedGmv,
      projectedProfit,
    }
  })
}

/** Filter only campaigns whose decision = 'scale_ready'. Ranked by scale score
 *  (trueRoas × log(conversions + 1) × adSpend weight). */
export function pickScalableCampaigns(
  recs: CampaignScaleRec[],
  minAdSpend: number = 100_000,
): CampaignScaleRec[] {
  return recs
    .filter(
      (r) =>
        r.decision === 'scale_ready' &&
        r.adSpend >= minAdSpend &&
        r.conversions >= 5,
    )
    .sort((a, b) => {
      const scoreA =
        (a.trueRoas ?? a.currentRoas) * Math.log(a.conversions + 1)
      const scoreB =
        (b.trueRoas ?? b.currentRoas) * Math.log(b.conversions + 1)
      return scoreB - scoreA
    })
}
