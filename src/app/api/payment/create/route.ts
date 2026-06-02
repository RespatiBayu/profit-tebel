import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createIpaymuPayment, isIpaymuConfigured } from '@/lib/ipaymu'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PRICE = 99000

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isIpaymuConfigured()) {
    return NextResponse.json({ error: 'Pembayaran belum dikonfigurasi.' }, { status: 503 })
  }

  // Idempotency: if already paid, return success directly
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_paid')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.is_paid) {
    return NextResponse.json({ alreadyPaid: true })
  }

  // merchant_ref unik: PT- = one-time lifetime purchase
  const merchantRef = `PT-${user.id.slice(0, 8)}-${Date.now()}`

  const result = await createIpaymuPayment({
    merchantRef,
    amount: PRICE,
    customerName: user.email?.split('@')[0] ?? 'Pelanggan',
    customerEmail: user.email ?? 'noreply@profittebel.com',
    itemName: 'Profit Tebel — Lifetime Access',
    returnUrl: `${APP_URL}/dashboard`,
    cancelUrl: `${APP_URL}/dashboard?payment=cancel`,
    notifyUrl: `${APP_URL}/api/webhooks/ipaymu`,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Simpan mapping merchant_ref -> user agar webhook bisa resolve (service role bypass RLS)
  const service = await createServiceClient()
  const { error: insErr } = await service.from('payment_transactions').insert({
    merchant_ref: merchantRef,
    user_id: user.id,
    type: 'lifetime',
    amount: PRICE,
    provider: 'ipaymu',
    provider_ref: result.sessionId,
    checkout_url: result.url,
    status: 'pending',
  })
  if (insErr) {
    console.error('payment_transactions insert error (lifetime):', insErr)
    return NextResponse.json({ error: 'Gagal mencatat transaksi. Coba lagi.' }, { status: 500 })
  }

  return NextResponse.json({ redirectUrl: result.url })
}
