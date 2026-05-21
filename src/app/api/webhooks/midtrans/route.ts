import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? ''

// SHA512(order_id + status_code + gross_amount + server_key)
function verifySignature(orderId: string, statusCode: string, grossAmount: string, incoming: string): boolean {
  const hash = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`)
    .digest('hex')
  return hash === incoming
}

export async function POST(req: NextRequest) {
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status,
    custom_field1, // user.id (UUID penuh) — diisi saat create transaksi
    custom_field2, // 'monthly_subscription' | undefined
  } = body

  if (!verifySignature(order_id, status_code, gross_amount, signature_key)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const isSuccess =
    (transaction_status === 'settlement' || transaction_status === 'capture') &&
    (fraud_status === 'accept' || fraud_status === undefined)

  if (!isSuccess) {
    return NextResponse.json({ received: true })
  }

  const supabase = await createServiceClient()

  // Resolve user: custom_field1 = full user UUID (paling reliable)
  // Fallback: extract prefix dari order_id
  let profileId: string | null = null

  if (custom_field1 && custom_field1.length === 36) {
    // UUID format — langsung pakai
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', custom_field1)
      .maybeSingle()
    profileId = data?.id ?? null
  }

  if (!profileId) {
    // Fallback: prefix dari order_id (PT-{8chars}-timestamp atau PTS-{8chars}-timestamp)
    const parts = order_id.split('-')
    // PTS-xxxxxxxx-ts → parts[1], PT-xxxxxxxx-ts → parts[1]
    const prefix = parts[1] ?? ''
    if (prefix.length >= 8) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .like('id', `${prefix}%`)
      if (profiles?.length === 1) profileId = profiles[0].id
    }
  }

  if (!profileId) {
    console.error(`Midtrans webhook: cannot find profile for order ${order_id}`)
    return NextResponse.json({ received: true })
  }

  const isMonthlySubscription = custom_field2 === 'monthly_subscription' || order_id.startsWith('PTS-')

  if (isMonthlySubscription) {
    // Perpanjang 30 hari dari sekarang (atau dari expiry saat ini jika masih aktif)
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('subscription_expires_at, subscription_plan')
      .eq('id', profileId)
      .maybeSingle()

    const now = new Date()
    let baseDate = now

    // Jika masih aktif, perpanjang dari tanggal expiry (bukan dari sekarang)
    if (
      currentProfile?.subscription_plan === 'monthly' &&
      currentProfile.subscription_expires_at
    ) {
      const currentExpiry = new Date(currentProfile.subscription_expires_at)
      if (currentExpiry > now) {
        baseDate = currentExpiry
      }
    }

    const newExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_plan: 'monthly',
        subscription_expires_at: newExpiry.toISOString(),
        subscription_midtrans_order_id: order_id,
      })
      .eq('id', profileId)

    if (error) {
      console.error('Midtrans webhook: subscription update error', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    console.log(`Subscription activated for ${profileId} until ${newExpiry.toISOString()}`)
  } else {
    // One-time purchase (PT- prefix) — tandai is_paid + lifetime
    const { error } = await supabase
      .from('profiles')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_provider: 'midtrans',
        payment_id: order_id,
        subscription_plan: 'lifetime',
      })
      .eq('id', profileId)

    if (error) {
      console.error('Midtrans webhook: one-time update error', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
