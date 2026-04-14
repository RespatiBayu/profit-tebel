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

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Build unique order ID using user id + timestamp
  const orderId = `PT-${user.id.slice(0, 8)}-${Date.now()}`

  const body = {
    transaction_details: {
      order_id: orderId,
      gross_amount: 99000,
    },
    customer_details: {
      email: user.email,
    },
    item_details: [
      {
        id: 'profit-tebel-lifetime',
        price: 99000,
        quantity: 1,
        name: 'Profit Tebel — Lifetime Access',
      },
    ],
    callbacks: {
      finish: `${APP_URL}/dashboard`,
      error: `${APP_URL}/dashboard`,
      pending: `${APP_URL}/dashboard`,
    },
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
    console.error('Midtrans Snap error:', err)
    return NextResponse.json({ error: 'Gagal membuat transaksi. Coba lagi.' }, { status: 502 })
  }

  const data = await res.json() as { token: string; redirect_url: string }
  return NextResponse.json({ redirectUrl: data.redirect_url })
}
