import type { MarketplaceKey } from '@/lib/constants/marketplace-fees'

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface RoasInputs {
  marketplace: MarketplaceKey
  sellingPrice: number
  hpp: number
  packagingCost: number
  commissionRate: number     // e.g. 0.0825 for 8.25%
  adminFeeRate: number       // e.g. 0.045
  serviceFeeRate: number     // e.g. 0.00
  processingFee: number      // fixed Rp per order
  estimatedShipping: number  // seller-paid shipping cost (if applicable)
  sellerVoucher: number      // voucher amount seller absorbs per unit
  targetRoas: number         // desired ROAS
  estimatedCr: number        // conversion rate (e.g. 0.02 = 2%)
  estimatedCpc: number       // cost per click in Rp
}

// ---------------------------------------------------------------------------
// Results shapes
// ---------------------------------------------------------------------------

export interface RoasResults {
  // Core costs
  totalCogs: number          // hpp + packaging
  totalFees: number          // all marketplace fees + shipping + voucher
  netRevenuePerUnit: number  // selling_price - fees

  // Break-even
  profitBeforeAds: number    // net_revenue - cogs (profit if ROAS = ∞)
  breakEvenRoas: number      // min ROAS to cover cogs
  breakEvenAdSpend: number   // max ad spend per unit to break even

  // At target ROAS
  maxAdSpendAtTarget: number // max ad spend per unit at targetRoas
  acceptableCpa: number      // max CPA (cost per conversion) at targetRoas
  profitAtTargetRoas: number // expected profit/unit at targetRoas

  // Budget simulation (per 1,000,000 Rp ad spend)
  budgetUnit: number         // Rp 1,000,000
  estimatedClicks: number    // budget / cpc
  estimatedConversions: number // clicks * cr
  estimatedRevenue: number   // conversions * selling_price
  estimatedGmv: number       // same as revenue in this model
  simulatedRoas: number      // revenue / budget
  estimatedProfit: number    // conversions * profitPerUnit - adSpend

  // Feasibility
  isFeasible: boolean        // target ROAS <= break-even ROAS + margin
  feasibilityNote: string
}

// ---------------------------------------------------------------------------
// Main calculator
// ---------------------------------------------------------------------------

export function calculateRoas(inputs: RoasInputs): RoasResults {
  const {
    sellingPrice,
    hpp,
    packagingCost,
    commissionRate,
    adminFeeRate,
    serviceFeeRate,
    processingFee,
    estimatedShipping,
    sellerVoucher,
    targetRoas,
    estimatedCr,
    estimatedCpc,
  } = inputs

  // Total COGS per unit
  const totalCogs = hpp + packagingCost

  // Marketplace fees per unit
  const commissionFee = sellingPrice * commissionRate
  const adminFee = sellingPrice * adminFeeRate
  const serviceFee = sellingPrice * serviceFeeRate
  const totalFees = commissionFee + adminFee + serviceFee + processingFee + estimatedShipping + sellerVoucher

  // Net revenue per unit (after fees, before ads and COGS)
  const netRevenuePerUnit = sellingPrice - totalFees

  // Profit before ads = net revenue - cogs
  const profitBeforeAds = netRevenuePerUnit - totalCogs

  // Break-even ROAS = selling_price / max_ad_spend
  // At break-even: profitBeforeAds - adSpendPerUnit = 0
  // => adSpendPerUnit = profitBeforeAds
  // => ROAS = sellingPrice / profitBeforeAds
  const breakEvenAdSpend = profitBeforeAds > 0 ? profitBeforeAds : 0
  const breakEvenRoas = breakEvenAdSpend > 0 ? sellingPrice / breakEvenAdSpend : 0

  // Max ad spend at target ROAS: ROAS = GMV / adSpend => adSpend = GMV / ROAS
  const maxAdSpendAtTarget = targetRoas > 0 ? sellingPrice / targetRoas : 0

  // Acceptable CPA = max ad spend per conversion
  // (same as maxAdSpendAtTarget since 1 conversion = 1 unit sold)
  const acceptableCpa = maxAdSpendAtTarget

  // Profit at target ROAS
  const profitAtTargetRoas = profitBeforeAds - maxAdSpendAtTarget

  // Budget simulation (per Rp 1,000,000)
  const budgetUnit = 1_000_000
  const estimatedClicks = estimatedCpc > 0 ? budgetUnit / estimatedCpc : 0
  const estimatedConversions = estimatedClicks * estimatedCr
  const estimatedRevenue = estimatedConversions * sellingPrice
  const estimatedGmv = estimatedRevenue
  const simulatedRoas = budgetUnit > 0 ? estimatedRevenue / budgetUnit : 0
  const estimatedProfit = estimatedConversions * profitBeforeAds - budgetUnit

  // Feasibility check
  let isFeasible = false
  let feasibilityNote = ''

  if (sellingPrice <= 0) {
    feasibilityNote = 'Masukkan harga jual terlebih dahulu.'
  } else if (profitBeforeAds <= 0) {
    feasibilityNote = 'Harga jual lebih kecil dari biaya. Produk ini tidak profitable tanpa iklan.'
    isFeasible = false
  } else if (targetRoas > breakEvenRoas) {
    feasibilityNote = `Target ROAS ${targetRoas.toFixed(1)}x melebihi Break-Even ROAS ${breakEvenRoas.toFixed(1)}x. Artinya budget iklan lebih besar dari margin.`
    isFeasible = false
  } else if (targetRoas >= 3) {
    feasibilityNote = `Target ROAS ${targetRoas.toFixed(1)}x sangat baik! Produk ini layak di-SCALE.`
    isFeasible = true
  } else if (targetRoas >= 1.5) {
    feasibilityNote = `Target ROAS ${targetRoas.toFixed(1)}x dalam zona OPTIMIZE. Pantau konversi dan CPA.`
    isFeasible = true
  } else {
    feasibilityNote = `Target ROAS ${targetRoas.toFixed(1)}x terlalu rendah. Pertimbangkan menaikkan harga atau menurunkan biaya.`
    isFeasible = false
  }

  return {
    totalCogs,
    totalFees,
    netRevenuePerUnit,
    profitBeforeAds,
    breakEvenRoas,
    breakEvenAdSpend,
    maxAdSpendAtTarget,
    acceptableCpa,
    profitAtTargetRoas,
    budgetUnit,
    estimatedClicks,
    estimatedConversions,
    estimatedRevenue,
    estimatedGmv,
    simulatedRoas,
    estimatedProfit,
    isFeasible,
    feasibilityNote,
  }
}
