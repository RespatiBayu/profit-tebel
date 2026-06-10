// Sumber tunggal harga paket Profit Tebel.

export const PRICING = {
  basic: { normal: 149000, launch: 97000 },
  pro: { normal: 297000, launch: 197000 },
} as const

export function formatRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export function planPrice(tier: 'basic' | 'pro', launching = true): number {
  return launching ? PRICING[tier].launch : PRICING[tier].normal
}

export function hematPct(tier: 'basic' | 'pro'): number {
  const p = PRICING[tier]
  return Math.round((1 - p.launch / p.normal) * 100)
}

/**
 * Biaya upgrade Basic → Pro = SELISIH harga Pro − Basic.
 * User yang sudah beli Basic cukup bayar selisihnya; masa aktif Pro melanjutkan
 * periode lisensi Basic yang sudah berjalan (tidak reset 365 hari).
 */
export function proUpgradeCost(launching = true): number {
  return planPrice('pro', launching) - planPrice('basic', launching)
}
