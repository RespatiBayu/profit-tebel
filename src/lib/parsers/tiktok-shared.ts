export function parseNum(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '-') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const str = String(value).trim().replace(/\s/g, '')
  if (!str) return 0
  const normalized =
    str.includes(',') && str.includes('.')
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(',', '.')
  const num = parseFloat(normalized.replace(/[^\d.-]/g, ''))
  return Number.isFinite(num) ? num : 0
}

function pad2(value: string | number): string {
  const str = String(value)
  return str.length === 1 ? `0${str}` : str
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === '-') return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toIsoDate(value)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30)
    const date = new Date(excelEpoch + value * 86400000)
    return Number.isNaN(date.getTime()) ? null : toIsoDate(date)
  }

  const str = String(value).trim()
  if (!str) return null

  let match = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`

  match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (match) return `${match[3]}-${pad2(match[2])}-${pad2(match[1])}`

  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : toIsoDate(date)
}

export function parseStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str || null
}

export function headerIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((header, index) => {
    const key = String(header ?? '').trim()
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

export function valueAt(row: unknown[], index: Map<string, number>, header: string): unknown {
  const col = index.get(header)
  return col === undefined ? null : row[col]
}
