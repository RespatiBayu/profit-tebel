import crypto from 'crypto'

/**
 * iPaymu (SuperPay) payment gateway helper — API v2.
 *
 * Redirect-payment flow:
 * 1. POST /payment dengan signature header → iPaymu balas Data.Url (halaman bayar).
 *    User di-redirect ke Data.Url untuk memilih channel & membayar.
 * 2. Setelah bayar, iPaymu kirim notifikasi POST (form-urlencoded) ke notifyUrl.
 * 3. Notifikasi iPaymu TIDAK bertanda tangan, jadi kita verifikasi dengan
 *    query ulang status transaksi ke POST /transaction (pakai trx_id).
 *
 * Signature (semua request ke iPaymu):
 *   bodyHash    = sha256(json_body)            // lowercase hex
 *   stringToSign= "POST:{VA}:{bodyHash}:{API_KEY}"
 *   signature   = HMAC-SHA256(stringToSign, API_KEY)  // hex
 * Headers: va, signature, timestamp (YYYYMMDDHHmmss), Content-Type: application/json
 *
 * Catatan: iPaymu tidak punya custom_field. user_id di-resolve via tabel
 * payment_transactions (merchant_ref/referenceId -> user_id).
 */

const VA = process.env.IPAYMU_VA ?? ''
const API_KEY = process.env.IPAYMU_API_KEY ?? ''
const IS_PRODUCTION = process.env.IPAYMU_IS_PRODUCTION === 'true'

const BASE_URL = IS_PRODUCTION
  ? 'https://my.ipaymu.com/api/v2'
  : 'https://sandbox.ipaymu.com/api/v2'

export function isIpaymuConfigured(): boolean {
  return Boolean(VA && API_KEY)
}

/** timestamp format YYYYMMDDHHmmss (waktu Asia/Jakarta, GMT+7). */
function ipaymuTimestamp(): string {
  const jakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const y = jakarta.getUTCFullYear()
  const m = String(jakarta.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jakarta.getUTCDate()).padStart(2, '0')
  const hh = String(jakarta.getUTCHours()).padStart(2, '0')
  const mm = String(jakarta.getUTCMinutes()).padStart(2, '0')
  const ss = String(jakarta.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}${hh}${mm}${ss}`
}

/** Signature header untuk body JSON tertentu. */
function buildSignature(bodyString: string): string {
  const bodyHash = crypto.createHash('sha256').update(bodyString, 'utf8').digest('hex').toLowerCase()
  const stringToSign = `POST:${VA}:${bodyHash}:${API_KEY}`
  return crypto.createHmac('sha256', API_KEY).update(stringToSign).digest('hex')
}

/** POST ber-signature ke endpoint iPaymu. Body di-hash harus byte-identik dgn yg dikirim. */
async function ipaymuPost(path: string, payload: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null; error?: string }> {
  const bodyString = JSON.stringify(payload)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        va: VA,
        signature: buildSignature(bodyString),
        timestamp: ipaymuTimestamp(),
      },
      body: bodyString,
    })
  } catch (e) {
    console.error(`iPaymu ${path} network error:`, e)
    return { ok: false, data: null, error: 'Gagal terhubung ke iPaymu. Coba lagi.' }
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return { ok: res.ok, data }
}

export type CreatePaymentInput = {
  /** referenceId kita (merchant_ref) untuk memetakan kembali ke user. */
  merchantRef: string
  amount: number
  customerName: string
  customerEmail: string
  customerPhone?: string
  itemName: string
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
}

export type CreatePaymentResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; error: string }

/** Buat redirect payment di iPaymu, balikin Url untuk redirect user. */
export async function createIpaymuPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  if (!isIpaymuConfigured()) {
    return { ok: false, error: 'iPaymu belum dikonfigurasi (cek env IPAYMU_*).' }
  }

  const payload = {
    product: [input.itemName],
    qty: [1],
    price: [input.amount],
    description: [input.itemName],
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    notifyUrl: input.notifyUrl,
    referenceId: input.merchantRef,
    buyerName: input.customerName,
    buyerEmail: input.customerEmail,
    buyerPhone: input.customerPhone ?? '08000000000',
  }

  const { ok, data, error } = await ipaymuPost('/payment', payload)
  if (error) return { ok: false, error }

  const status = data?.Status
  const inner = (data?.Data ?? null) as { SessionID?: string; Url?: string } | null

  if (!ok || status !== 200 || !inner?.Url) {
    const msg = (data?.Message as string) ?? 'Gagal membuat transaksi iPaymu. Coba lagi.'
    console.error('iPaymu create payment error:', msg, data)
    return { ok: false, error: msg }
  }

  return { ok: true, sessionId: inner.SessionID ?? '', url: inner.Url }
}

export type TransactionStatus = 'paid' | 'pending' | 'expired' | 'failed' | 'refund' | 'unknown'

export type CheckTransactionResult = {
  ok: boolean
  status: TransactionStatus
  referenceId: string | null
  amount: number | null
}

/** Map Data.Status (int) / StatusDesc iPaymu ke status internal kita. */
function mapTransactionStatus(statusInt: number | null, statusDesc: string | null): TransactionStatus {
  const desc = (statusDesc ?? '').toLowerCase()
  if (statusInt === 1 || desc.includes('berhasil') || desc.includes('success') || desc.includes('paid')) return 'paid'
  if (statusInt === 0 || desc.includes('pending') || desc.includes('menunggu')) return 'pending'
  if (statusInt === 6 || desc.includes('refund')) return 'refund'
  if (statusInt === -2 || desc.includes('expired') || desc.includes('kadaluarsa') || desc.includes('batal') || desc.includes('cancel')) return 'expired'
  if (desc.includes('gagal') || desc.includes('fail')) return 'failed'
  return 'unknown'
}

/**
 * Query ulang status transaksi by trx_id (verifikasi notifikasi).
 * iPaymu: POST /transaction body { transactionId }.
 */
export async function checkIpaymuTransaction(trxId: string): Promise<CheckTransactionResult> {
  if (!isIpaymuConfigured()) {
    return { ok: false, status: 'unknown', referenceId: null, amount: null }
  }

  const { ok, data } = await ipaymuPost('/transaction', { transactionId: trxId })
  const inner = (data?.Data ?? null) as {
    Status?: number
    StatusDesc?: string
    ReferenceId?: string
    Amount?: number | string
  } | null

  if (!ok || data?.Status !== 200 || !inner) {
    console.error('iPaymu check transaction error:', data?.Message ?? 'unknown', data)
    return { ok: false, status: 'unknown', referenceId: null, amount: null }
  }

  const amountNum = inner.Amount != null ? Number(inner.Amount) : null
  return {
    ok: true,
    status: mapTransactionStatus(inner.Status ?? null, inner.StatusDesc ?? null),
    referenceId: inner.ReferenceId ?? null,
    amount: Number.isFinite(amountNum as number) ? (amountNum as number) : null,
  }
}
