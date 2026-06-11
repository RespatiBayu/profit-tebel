// Single source of truth untuk transisi state langganan (Basic/Pro tahunan).
// Dipakai oleh aktivasi manual (superadmin) dan webhook pembayaran iPaymu nanti.

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export type ActivationTarget = 'basic' | 'pro' | 'free'

/**
 * Hitung patch profiles untuk mengaktifkan/mengubah langganan.
 *
 * Aturan:
 * - free               → cabut akses berbayar.
 * - basic / pro (baru) → aktif 365 hari sejak sekarang. Kalau plan sama & masih
 *   aktif → perpanjang dari expiry yang ada (bukan reset).
 * - UPGRADE Basic→Pro saat Basic masih aktif → set Pro, masa aktif TETAP ikut
 *   lisensi Basic (tidak reset 365 hari). User cukup bayar selisih harga.
 */
export function computeActivationPatch(opts: {
  currentPlan: string | null
  currentExpiresAt: string | null
  target: ActivationTarget
  ref: string
  provider: 'manual' | 'ipaymu'
  now?: Date
}): Record<string, unknown> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const { currentPlan, currentExpiresAt, target, ref, provider } = opts
  const currentActive = !!currentExpiresAt && new Date(currentExpiresAt) > now

  if (target === 'free') {
    return { subscription_plan: 'free', subscription_expires_at: null }
  }

  const paidFields = {
    subscription_payment_ref: ref,
    is_paid: true,
    paid_at: nowIso,
    payment_provider: provider,
    payment_id: ref,
  }

  // UPGRADE Basic → Pro: pertahankan expiry Basic (bayar selisih).
  if (target === 'pro' && currentPlan === 'basic' && currentActive) {
    return {
      subscription_plan: 'pro',
      subscription_expires_at: currentExpiresAt,
      ...paidFields,
    }
  }

  // Aktivasi/perpanjangan Basic atau Pro: 365 hari. Perpanjang dari expiry
  // yang ada kalau plan-nya sama & masih aktif.
  const sameActive = currentPlan === target && currentActive
  const base = sameActive && currentExpiresAt ? new Date(currentExpiresAt) : now
  const expiry = new Date(base.getTime() + YEAR_MS)

  return {
    subscription_plan: target,
    subscription_expires_at: expiry.toISOString(),
    ...paidFields,
  }
}
