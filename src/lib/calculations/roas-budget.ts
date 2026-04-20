/**
 * Kalkulator ROAS format Excel "BUDGETING PRODUK & KALKULATOR ROAS".
 *
 * Formula (per produk / kolom di Excel):
 *   Total Pajak      = (adminFee% + ongkirExtra% + promoExtra%) × Harga Jual + biaya Per Pesanan
 *   Gross Profit     = Harga Jual − HPP − Total Pajak
 *   % Gross Profit   = Gross Profit / Harga Jual
 *   Rugi ROAS (BEP)  = Harga Jual / Gross Profit        ← titik impas
 *   Target Kompetitif  = 1.7 × BEP
 *   Target Konservatif = 2.0 × BEP
 *   Target Prospektif  = 4.0 × BEP
 *   Est. Biaya Iklan = Harga Jual / Estimasi Hasil ROAS
 *   Est. Profit      = Gross Profit − Est. Biaya Iklan
 */

import { ROAS_TARGET_MULTIPLIERS } from '@/lib/constants/shopee-fees-2026'

export interface RoasBudgetInputs {
  hpp: number
  hargaJual: number
  adminFeeRate: number   // decimal, e.g. 0.0825 = 8.25%
  ongkirExtraRate: number
  promoExtraRate: number
  biayaPerPesanan: number
  estimasiRoas: number   // 0 atau kosong = tidak dihitung
}

export interface RoasBudgetResult {
  totalPajakPct: number  // sum of all % fees (for display)
  totalPajak: number     // rupiah
  grossProfit: number
  grossProfitPct: number // 0..1
  bepRoas: number | null        // null jika gross profit <= 0
  targetKompetitif: number | null
  targetKonservatif: number | null
  targetProspektif: number | null
  estBiayaIklan: number | null  // null jika estimasiRoas <= 0
  estProfit: number | null
  isFeasible: boolean           // grossProfit > 0
}

export function calculateRoasBudget(input: RoasBudgetInputs): RoasBudgetResult {
  const { hpp, hargaJual, adminFeeRate, ongkirExtraRate, promoExtraRate, biayaPerPesanan, estimasiRoas } = input

  const totalPajakPct = adminFeeRate + ongkirExtraRate + promoExtraRate
  const totalPajak = hargaJual > 0 ? hargaJual * totalPajakPct + biayaPerPesanan : 0
  const grossProfit = hargaJual - hpp - totalPajak
  const grossProfitPct = hargaJual > 0 ? grossProfit / hargaJual : 0

  const isFeasible = grossProfit > 0 && hargaJual > 0
  const bepRoas = isFeasible ? hargaJual / grossProfit : null

  const targetKompetitif = bepRoas !== null ? bepRoas * ROAS_TARGET_MULTIPLIERS.kompetitif : null
  const targetKonservatif = bepRoas !== null ? bepRoas * ROAS_TARGET_MULTIPLIERS.konservatif : null
  const targetProspektif = bepRoas !== null ? bepRoas * ROAS_TARGET_MULTIPLIERS.prospektif : null

  const estBiayaIklan = estimasiRoas > 0 && hargaJual > 0 ? hargaJual / estimasiRoas : null
  const estProfit = estBiayaIklan !== null ? grossProfit - estBiayaIklan : null

  return {
    totalPajakPct,
    totalPajak,
    grossProfit,
    grossProfitPct,
    bepRoas,
    targetKompetitif,
    targetKonservatif,
    targetProspektif,
    estBiayaIklan,
    estProfit,
    isFeasible,
  }
}
