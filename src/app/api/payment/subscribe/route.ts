import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createTripayTransaction, isTripayConfigured } from '@/lib/tripay'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PRICE = 49000

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isTripayConfigured()) {
    return NextResponse.json({ error: 'Pembayaran belum dikonfigurasi.' }, { status: 503 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan, subscription_expires_at')
    .eq('id', user.id)
    .maybeSingle()

  // Jika masih aktif (> 1 hari tersisa), tolak — user harus tunggu mendekati expiry
  if (profile?.subscription_plan === 'monthly' && profile.subscription_expires_at) {
    const expiresAt = new Date(profile.subscription_expires_at)
    const msRemaining = expiresAt.getTime() - Date.now()
    if (msRemaining > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ alreadyActive: true, expiresAt: profile.subscription_expires_at })
    }
  }

  // Lifetime tidak perlu subscribe bulanan
  if (profile?.subscription_plan === 'lifetime') {
    return NextResponse.json({ isLifetime: true })
  }

  // merchant_ref: PTS = Profit Tebel Subscribe (beda dari PT = one-time)
  const merchantRef = `PTS-${user.id.slice(0, 8)}-${Date.now()}`

  const result = await createTripayTransaction({
    merchantRef,
    amount: PRICE,
    customerName: user.email?.split('@')[0] ?? 'Pelanggan',
    customerEmail: user.email ?? 'noreply@profittebel.com',
    itemSku: 'profit-tebel-monthly',
    itemName: 'Profit Tebel Pro — Langganan Bulanan (30 hari)',
    returnUrl: `${APP_URL}/dashboard?subscribe=success`,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Simpan mapping merchant_ref -> user agar webhook bisa resolve (service role bypass RLS)
  const service = await createServiceClient()
  const { error: insErr } = await service.from('payment_transactions').insert({
    merchant_ref: merchantRef,
    user_id: user.id,
    type: 'monthly',
    amount: PRICE,
    provider: 'tripay',
    provider_ref: result.reference,
    checkout_url: result.checkoutUrl,
    status: 'pending',
  })
  if (insErr) {
    console.error('payment_transactions insert error (monthly):', insErr)
    return NextResponse.json({ error: 'Gagal mencatat transaksi. Coba lagi.' }, { status: 500 })
  }

  return NextResponse.json({ redirectUrl: result.checkoutUrl, orderId: merchantRef })
}
