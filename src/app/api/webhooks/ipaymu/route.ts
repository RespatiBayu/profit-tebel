import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkIpaymuTransaction } from '@/lib/ipaymu'

/**
 * POST /api/webhooks/ipaymu
 *
 * Notifikasi dari iPaymu setelah status pembayaran berubah. iPaymu mengirim
 * data form-urlencoded (trx_id, reference_id, status, status_code, ...).
 *
 * Notifikasi iPaymu TIDAK bertanda tangan, jadi kita JANGAN percaya field
 * "status" mentah — kita verifikasi dengan query ulang status transaksi
 * (checkIpaymuTransaction by trx_id). Baru aktifkan akses kalau benar 'paid'.
 *
 * user_id di-resolve via tabel payment_transactions (reference_id -> user_id).
 * Set URL ini di body notifyUrl saat create payment (otomatis dari APP_URL).
 */
export async function POST(req: NextRequest) {
  // iPaymu mengirim application/x-www-form-urlencoded
  let trxId = ''
  let referenceId = ''
  try {
    const form = await req.formData()
    trxId = String(form.get('trx_id') ?? form.get('trxId') ?? '')
    referenceId = String(form.get('reference_id') ?? form.get('referenceId') ?? '')
  } catch {
    // fallback: coba JSON
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    trxId = String(body?.trx_id ?? body?.trxId ?? '')
    referenceId = String(body?.reference_id ?? body?.referenceId ?? '')
  }

  if (!trxId) {
    return NextResponse.json({ success: false, message: 'Missing trx_id' }, { status: 400 })
  }

  // Verifikasi: query ulang status transaksi ke iPaymu (jangan percaya payload mentah)
  const verified = await checkIpaymuTransaction(trxId)
  if (!verified.ok) {
    // Jangan aktifkan; balas 200 supaya iPaymu tidak retry selamanya untuk error sementara
    console.error(`iPaymu webhook: gagal verifikasi trx_id ${trxId}`)
    return NextResponse.json({ success: true })
  }

  // merchant_ref kita = referenceId. Prioritas dari hasil verifikasi, fallback ke payload.
  const merchantRef = verified.referenceId || referenceId
  if (!merchantRef) {
    return NextResponse.json({ success: false, message: 'Missing reference_id' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: tx } = await supabase
    .from('payment_transactions')
    .select('merchant_ref, user_id, type, status')
    .eq('merchant_ref', merchantRef)
    .maybeSingle()

  if (!tx) {
    console.error(`iPaymu webhook: unknown reference_id ${merchantRef}`)
    return NextResponse.json({ success: true })
  }

  // Status non-final → catat saja, jangan aktifkan akses
  if (verified.status !== 'paid') {
    const mapped =
      verified.status === 'expired' ? 'expired' :
      verified.status === 'failed' ? 'failed' :
      verified.status === 'refund' ? 'refund' : 'pending'
    await supabase
      .from('payment_transactions')
      .update({ status: mapped, provider_ref: trxId })
      .eq('merchant_ref', merchantRef)
    return NextResponse.json({ success: true })
  }

  // Idempotency: kalau sudah paid, jangan proses ulang
  if (tx.status === 'paid') {
    return NextResponse.json({ success: true })
  }

  const profileId = tx.user_id
  const nowIso = new Date().toISOString()

  if (tx.type === 'monthly') {
    // Perpanjang 30 hari dari sekarang (atau dari expiry saat ini jika masih aktif)
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('subscription_expires_at, subscription_plan')
      .eq('id', profileId)
      .maybeSingle()

    const now = new Date()
    let baseDate = now
    if (
      currentProfile?.subscription_plan === 'monthly' &&
      currentProfile.subscription_expires_at
    ) {
      const currentExpiry = new Date(currentProfile.subscription_expires_at)
      if (currentExpiry > now) baseDate = currentExpiry
    }

    const newExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_plan: 'monthly',
        subscription_expires_at: newExpiry.toISOString(),
        subscription_payment_ref: merchantRef,
      })
      .eq('id', profileId)

    if (error) {
      console.error('iPaymu webhook: subscription update error', error)
      return NextResponse.json({ success: false, message: 'DB update failed' }, { status: 500 })
    }
    console.log(`Subscription activated for ${profileId} until ${newExpiry.toISOString()}`)
  } else {
    // Lifetime one-time purchase
    const { error } = await supabase
      .from('profiles')
      .update({
        is_paid: true,
        paid_at: nowIso,
        payment_provider: 'ipaymu',
        payment_id: merchantRef,
        subscription_plan: 'lifetime',
      })
      .eq('id', profileId)

    if (error) {
      console.error('iPaymu webhook: one-time update error', error)
      return NextResponse.json({ success: false, message: 'DB update failed' }, { status: 500 })
    }
  }

  // Tandai transaksi paid (riwayat)
  await supabase
    .from('payment_transactions')
    .update({ status: 'paid', paid_at: nowIso, provider_ref: trxId })
    .eq('merchant_ref', merchantRef)

  return NextResponse.json({ success: true })
}
