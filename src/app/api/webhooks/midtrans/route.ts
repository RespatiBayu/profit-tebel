import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? ''

// Midtrans notification signature:
// SHA512(order_id + status_code + gross_amount + server_key)
function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string
): (incoming: string) => boolean {
  const hash = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`)
    .digest('hex')
  return (incoming: string) => incoming === hash
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
    custom_field1, // we'll use this to pass user email (optional)
  } = body

  // Verify signature
  const isValid = verifySignature(order_id, status_code, gross_amount)(signature_key)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Only mark paid on successful settlement/capture
  const isSuccess =
    (transaction_status === 'settlement' || transaction_status === 'capture') &&
    (fraud_status === 'accept' || fraud_status === undefined)

  if (!isSuccess) {
    return NextResponse.json({ received: true })
  }

  const supabase = await createServiceClient()

  // Extract user ID from order_id: format is "PT-{userId8chars}-{timestamp}"
  // or use custom_field1 if we stored user id there
  const userIdPrefix = order_id.split('-')[1] // first 8 chars of user id

  // Look up profile by partial user id prefix (id starts with that)
  // Since UUIDs can have same prefix, we also match by order_id stored in payment_id
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .like('id', `${userIdPrefix}%`)

  // Find the right profile — match by stored payment_id OR if only one match
  let profileId: string | null = null

  if (profiles && profiles.length === 1) {
    profileId = profiles[0].id
  } else if (profiles && profiles.length > 1 && custom_field1) {
    // If we have multiple matches, try custom_field1 as email
    const { data: byEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', custom_field1)
      .maybeSingle()
    profileId = byEmail?.id ?? null
  }

  if (!profileId) {
    console.error(`Midtrans webhook: cannot find profile for order ${order_id}`)
    // Return 200 so Midtrans doesn't retry endlessly
    return NextResponse.json({ received: true })
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      payment_provider: 'midtrans',
      payment_id: order_id,
    })
    .eq('id', profileId)

  if (error) {
    console.error('Midtrans webhook: update error', error)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
