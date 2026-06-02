import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createTripayTransaction, isTripayConfigured } from '@/lib/tripay'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PRICE = 99000

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isTripayConfigured()) {
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

  const result = await createTripayTransaction({
    merchantRef,
    amount: PRICE,
    customerName: user.email?.split('@')[0] ?? 'Pelanggan',
    customerEmail: user.email ?? 'noreply@profittebel.com',
    itemSku: 'profit-tebel-lifetime',
    itemName: 'Profit Tebel — Lifetime Access',
    returnUrl: `${APP_URL}/dashboard`,
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
    provider: 'tripay',
    provider_ref: result.reference,
    checkout_url: result.checkoutUrl,
    status: 'pending',
  })
  if (insErr) {
    console.error('payment_transactions insert error (lifetime):', insErr)
    return NextResponse.json({ error: 'Gagal mencatat transaksi. Coba lagi.' }, { status: 500 })
  }

  return NextResponse.json({ redirectUrl: result.checkoutUrl })
}
