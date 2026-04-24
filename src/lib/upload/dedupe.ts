/**
 * Dedupe helper untuk upload parser — ganti logic lama "skip if exists" dengan
 * compare: kalau record udah ada & value-nya sama persis → skip (unchanged),
 * kalau udah ada tapi value beda → update ke versi terbaru, kalau belum ada →
 * insert baru.
 *
 * Tujuan: re-upload file yang di-refresh dari Shopee (misal settlement update,
 * ad spend koreksi) otomatis ambil versi terbaru tanpa perlu wipe manual.
 */

/** Normalize nilai buat signature — toleransi float rounding kecil. */
function normVal(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'number') {
    // Toleransi pembulatan Shopee (2 desimal sudah cukup untuk rupiah).
    return Number.isFinite(v) ? v.toFixed(2) : '∅'
  }
  if (typeof v === 'boolean') return v ? '1' : '0'
  return String(v)
}

/** Bangun signature string dari subset field yang di-compare. */
export function buildSignature<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T)[],
): string {
  return fields.map((f) => normVal(row[f])).join('§')
}

export interface ClassifyResult<T> {
  /** Rows baru — belum pernah ada di DB. Harus di-insert. */
  toInsert: T[]
  /** Rows yang sudah ada tapi values-nya beda — harus di-update ke versi baru. */
  toUpdate: T[]
  /** Jumlah rows yang udah ada & identik — no-op. */
  unchangedCount: number
}

/**
 * Klasifikasi incoming rows vs existing rows di DB.
 *
 * @param incoming  Rows dari file yang di-upload.
 * @param existingByKey  Map existing DB rows, keyed by identity (e.g. order_number).
 * @param identity  Fungsi ambil identity key dari row.
 * @param compareFields  Field-field yang dibandingkan untuk detect perubahan.
 */
export function classifyIncomingRows<T extends Record<string, unknown>>(
  incoming: T[],
  existingByKey: Map<string, T>,
  identity: (row: T) => string,
  compareFields: readonly (keyof T)[],
): ClassifyResult<T> {
  const toInsert: T[] = []
  const toUpdate: T[] = []
  let unchangedCount = 0

  for (const row of incoming) {
    const key = identity(row)
    const existing = existingByKey.get(key)
    if (!existing) {
      toInsert.push(row)
      continue
    }
    const sigNew = buildSignature(row, compareFields)
    const sigOld = buildSignature(existing, compareFields)
    if (sigNew === sigOld) {
      unchangedCount += 1
    } else {
      toUpdate.push(row)
    }
  }

  return { toInsert, toUpdate, unchangedCount }
}
