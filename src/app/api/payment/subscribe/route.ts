import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? ''
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true'
const SNAP_URL = IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Order ID: PTS = Profit Tebel Subscribe, beda dari PT = one-time purchase
  const orderId = `PTS-${user.id.slice(0, 8)}-${Date.now()}`

  const body = {
    transaction_details: {
      order_id: orderId,
      gross_amount: 49000,
    },
    customer_details: {
      email: user.email,
    },
    item_details: [
      {
        id: 'profit-tebel-monthly',
        price: 49000,
        quantity: 1,
        name: 'Profit Tebel Pro — Langganan Bulanan (30 hari)',
      },
    ],
    callbacks: {
      finish: `${APP_URL}/dashboard?subscribe=success`,
      error: `${APP_URL}/dashboard/inventory?subscribe=error`,
      pending: `${APP_URL}/dashboard/inventory?subscribe=pending`,
    },
    // Simpan user id di custom_field agar webhook bisa resolve tanpa ambiguity
    custom_field1: user.id,
    custom_field2: 'monthly_subscription',
  }

  const authHeader = `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64')}`

  const res = await fetch(SNAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Midtrans Snap subscribe error:', err)
    return NextResponse.json({ error: 'Gagal membuat transaksi. Coba lagi.' }, { status: 502 })
  }

  const data = await res.json() as { token: string; redirect_url: string }
  return NextResponse.json({ redirectUrl: data.redirect_url, orderId })
}
