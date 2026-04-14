import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Verify the webhook signature from Lemonsqueezy
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret || secret === 'your_lemonsqueezy_webhook_secret') {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('x-signature') ?? ''
  const body = await req.text()

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = event.meta && (event.meta as Record<string, unknown>).event_name as string

  // Only process successful order events
  if (eventName !== 'order_created') {
    return NextResponse.json({ received: true })
  }

  const data = event.data as Record<string, unknown>
  const attributes = data?.attributes as Record<string, unknown>

  // Extract buyer email and order ID
  const buyerEmail = attributes?.user_email as string | undefined
  const orderId = String(data?.id ?? '')
  const status = attributes?.status as string | undefined

  if (!buyerEmail || status !== 'paid') {
    return NextResponse.json({ received: true })
  }

  const supabase = await createServiceClient()

  // Find user by email and mark as paid
  const { data: profile, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', buyerEmail)
    .maybeSingle()

  if (lookupError) {
    console.error('Webhook: profile lookup error', lookupError)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!profile) {
    // User hasn't signed up yet — store pending payment for when they register
    // For now just log and return OK (Lemonsqueezy will retry if we return 5xx)
    // Log for manual follow-up; don't return 5xx or Lemonsqueezy will retry endlessly
    console.log(`Webhook: no profile found for email=${buyerEmail} order=${orderId}`)
    return NextResponse.json({ received: true })
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      payment_provider: 'lemonsqueezy',
      payment_id: orderId,
    })
    .eq('id', profile.id)

  if (updateError) {
    console.error('Webhook: profile update error', updateError)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
