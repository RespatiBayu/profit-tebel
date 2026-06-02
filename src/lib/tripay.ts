import crypto from 'crypto'

/**
 * Tripay payment gateway helper.
 *
 * Tripay closed-payment flow:
 * 1. POST /transaction/create dengan signature HMAC-SHA256(merchant_code + merchant_ref + amount).
 * 2. Tripay balas checkout_url → user di-redirect ke sana untuk bayar.
 * 3. Setelah bayar, Tripay kirim callback POST ke URL yang di-set di dashboard merchant.
 *    Header X-Callback-Signature = HMAC-SHA256(raw_body, private_key) untuk verifikasi.
 *
 * Catatan: Tripay TIDAK punya custom_field. user_id di-resolve via tabel
 * payment_transactions (merchant_ref -> user_id), bukan dari payload Tripay.
 */

const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE ?? ''
const API_KEY = process.env.TRIPAY_API_KEY ?? ''
const PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY ?? ''
const IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true'

/** Channel pembayaran. QRIS = paling universal (cover semua e-wallet & bank via QR). */
const DEFAULT_METHOD = process.env.TRIPAY_PAYMENT_METHOD ?? 'QRIS'

const BASE_URL = IS_PRODUCTION
  ? 'https://tripay.co.id/api'
  : 'https://tripay-sandbox.co.id/api'

export function isTripayConfigured(): boolean {
  return Boolean(MERCHANT_CODE && API_KEY && PRIVATE_KEY)
}

/** Signature untuk create transaction: HMAC-SHA256(merchant_code + merchant_ref + amount, private_key). */
function createSignature(merchantRef: string, amount: number): string {
  return crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(`${MERCHANT_CODE}${merchantRef}${amount}`)
    .digest('hex')
}

/** Verifikasi callback Tripay: HMAC-SHA256(raw_json_body, private_key) === X-Callback-Signature. */
export function verifyCallbackSignature(rawBody: string, incoming: string): boolean {
  const expected = crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(rawBody)
    .digest('hex')
  // timing-safe compare
  const a = Buffer.from(expected)
  const b = Buffer.from(incoming ?? '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export type CreateTransactionInput = {
  merchantRef: string
  amount: number
  customerName: string
  customerEmail: string
  itemSku: string
  itemName: string
  returnUrl: string
  /** Override channel (default QRIS). */
  method?: string
}

export type CreateTransactionResult =
  | { ok: true; reference: string; checkoutUrl: string }
  | { ok: false; error: string }

/** Buat transaksi closed-payment di Tripay, balikin checkout_url untuk redirect. */
export async function createTripayTransaction(
  input: CreateTransactionInput
): Promise<CreateTransactionResult> {
  if (!isTripayConfigured()) {
    return { ok: false, error: 'Tripay belum dikonfigurasi (cek env TRIPAY_*).' }
  }

  const payload = {
    method: input.method ?? DEFAULT_METHOD,
    merchant_ref: input.merchantRef,
    amount: input.amount,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    order_items: [
      {
        sku: input.itemSku,
        name: input.itemName,
        price: input.amount,
        quantity: 1,
      },
    ],
    return_url: input.returnUrl,
    expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 jam
    signature: createSignature(input.merchantRef, input.amount),
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/transaction/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('Tripay create transaction network error:', e)
    return { ok: false, error: 'Gagal terhubung ke Tripay. Coba lagi.' }
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean
    message?: string
    data?: { reference?: string; checkout_url?: string }
  } | null

  if (!res.ok || !data?.success || !data.data?.checkout_url || !data.data.reference) {
    console.error('Tripay create transaction error:', data?.message ?? res.statusText)
    return { ok: false, error: data?.message ?? 'Gagal membuat transaksi. Coba lagi.' }
  }

  return { ok: true, reference: data.data.reference, checkoutUrl: data.data.checkout_url }
}
