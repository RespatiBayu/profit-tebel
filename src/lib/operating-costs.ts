// Helper bersama untuk fitur Biaya Operasional.

/** Parse "YYYY-MM-DD" → { iso, year, month } atau null kalau tidak valid. */
export function parseCostDate(value: unknown): { iso: string; year: number; month: number } | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, year, month }
}
