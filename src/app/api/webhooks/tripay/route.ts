import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyCallbackSignature } from '@/lib/tripay'

/**
 * POST /api/webhooks/tripay
 *
 * Callback dari Tripay setelah status pembayaran berubah. Tripay kirim header
 * X-Callback-Signature = HMAC-SHA256(raw_body, private_key) dan X-Callback-Event.
 *
 * user_id di-resolve via tabel payment_transactions (merchant_ref -> user_id),
 * karena Tripay tidak punya custom_field seperti Midtrans.
 *
 * Set URL ini di dashboard Tripay → Merchant → Callback URL.
 */
export async function POST(req: NextRequest) {
  // Baca raw body untuk verifikasi signature (harus byte-identik dgn yg di-hash Tripay)
  const rawBody = await req.text()
  const signature = req.headers.get('x-callback-signature') ?? ''

  if (!verifyCallbackSignature(rawBody, signature)) {
    return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
  }

  const event = req.headers.get('x-callback-event')
  if (event && event !== 'payment_status') {
    return NextResponse.json({ success: true })
  }

  let body: {
    merchant_ref?: string
    reference?: string
    status?: string
    is_closed_payment?: number
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
  }

  const merchantRef = body.merchant_ref
  if (!merchantRef) {
    return NextResponse.json({ success: false, message: 'Missing merchant_ref' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Resolve transaksi dari mapping kita
  const { data: tx } = await supabase
    .from('payment_transactions')
    .select('merchant_ref, user_id, type, status')
    .eq('merchant_ref', merchantRef)
    .maybeSingle()

  if (!tx) {
    console.error(`Tripay webhook: unknown merchant_ref ${merchantRef}`)
    // 200 supaya Tripay tidak retry selamanya untuk ref yg memang tak dikenal
    return NextResponse.json({ success: true })
  }

  const status = (body.status ?? '').toUpperCase()

  // Status non-final → catat saja, jangan aktifkan akses
  if (status !== 'PAID') {
    const mapped =
      status === 'EXPIRED' ? 'expired' :
      status === 'FAILED' ? 'failed' :
      status === 'REFUND' ? 'refund' : 'pending'
    await supabase
      .from('payment_transactions')
      .update({ status: mapped, provider_ref: body.reference ?? null })
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
      console.error('Tripay webhook: subscription update error', error)
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
        payment_provider: 'tripay',
        payment_id: merchantRef,
        subscription_plan: 'lifetime',
      })
      .eq('id', profileId)

    if (error) {
      console.error('Tripay webhook: one-time update error', error)
      return NextResponse.json({ success: false, message: 'DB update failed' }, { status: 500 })
    }
  }

  // Tandai transaksi paid (riwayat)
  await supabase
    .from('payment_transactions')
    .update({ status: 'paid', paid_at: nowIso, provider_ref: body.reference ?? null })
    .eq('merchant_ref', merchantRef)

  return NextResponse.json({ success: true })
}
