import Papa from 'papaparse'
import type { AdsParseResult, ParsedAdsRow } from '@/types'

// Column indices in data rows (0-based)
const COL = {
  RANK: 0,
  PRODUCT_NAME: 1,
  PRODUCT_CODE: 2,
  IMPRESSIONS: 3,
  CLICKS: 4,
  CTR: 5,               // has "%" suffix
  CONVERSIONS: 6,
  DIRECT_CONVERSIONS: 7,
  CONVERSION_RATE: 8,   // has "%" suffix
  DIRECT_CONVERSION_RATE: 9, // has "%" suffix
  COST_PER_CONVERSION: 10,
  COST_PER_DIRECT_CONVERSION: 11,
  UNITS_SOLD: 12,
  DIRECT_UNITS_SOLD: 13,
  GMV: 14,
  DIRECT_GMV: 15,
  AD_SPEND: 16,
  ROAS: 17,
  DIRECT_ROAS: 18,
  ACOS: 19,             // has "%" suffix
  DIRECT_ACOS: 20,      // has "%" suffix
  VOUCHER_AMOUNT: 21,
  VOUCHERED_SALES: 22,
} as const

function parseNum(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '-') return 0
  let str = String(value).trim()

  // Strip "%" suffix
  str = str.replace(/%$/, '')

  // Handle Indonesian number format: 1.234,56 → 1234.56
  // Detect if it's Indonesian format (period as thousands, comma as decimal)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    // Regular format - just remove any non-numeric except dot and minus
    str = str.replace(/[^\d.-]/g, '')
  }

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function parsePercent(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '-') return 0
  const str = String(value).replace(/%$/, '').trim()
  // Indonesian format check
  let clean = str
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    clean = str.replace(/\./g, '').replace(',', '.')
  } else {
    clean = str.replace(',', '.')
  }
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num / 100
}

function parseStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

// Try to extract date range from metadata rows (rows 0-5)
function extractPeriod(metaRows: string[][]): { start: string | null; end: string | null } {
  const fullText = metaRows.flat().join(' ')

  // Match patterns like "01/01/2024 - 31/01/2024" or "2024-01-01 - 2024-01-31"
  const patterns = [
    /(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})/,
  ]

  for (const pattern of patterns) {
    const match = fullText.match(pattern)
    if (match) {
      const parseDate = (s: string) => {
        if (s.includes('/')) {
          const [d, m, y] = s.split('/')
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        return s
      }
      return { start: parseDate(match[1]), end: parseDate(match[2]) }
    }
  }

  return { start: null, end: null }
}

function rowToAdsRow(row: string[]): ParsedAdsRow {
  return {
    product_name: parseStr(row[COL.PRODUCT_NAME]),
    product_code: String(row[COL.PRODUCT_CODE] ?? '').trim(),
    impressions: Math.round(parseNum(row[COL.IMPRESSIONS])),
    clicks: Math.round(parseNum(row[COL.CLICKS])),
    ctr: parsePercent(row[COL.CTR]),
    conversions: Math.round(parseNum(row[COL.CONVERSIONS])),
    direct_conversions: Math.round(parseNum(row[COL.DIRECT_CONVERSIONS])),
    conversion_rate: parsePercent(row[COL.CONVERSION_RATE]),
    direct_conversion_rate: parsePercent(row[COL.DIRECT_CONVERSION_RATE]),
    cost_per_conversion: parseNum(row[COL.COST_PER_CONVERSION]),
    cost_per_direct_conversion: parseNum(row[COL.COST_PER_DIRECT_CONVERSION]),
    units_sold: Math.round(parseNum(row[COL.UNITS_SOLD])),
    direct_units_sold: Math.round(parseNum(row[COL.DIRECT_UNITS_SOLD])),
    gmv: parseNum(row[COL.GMV]),
    direct_gmv: parseNum(row[COL.DIRECT_GMV]),
    ad_spend: parseNum(row[COL.AD_SPEND]),
    roas: parseNum(row[COL.ROAS]),
    direct_roas: parseNum(row[COL.DIRECT_ROAS]),
    acos: parsePercent(row[COL.ACOS]),
    direct_acos: parsePercent(row[COL.DIRECT_ACOS]),
    voucher_amount: parseNum(row[COL.VOUCHER_AMOUNT]),
    vouchered_sales: parseNum(row[COL.VOUCHERED_SALES]),
  }
}

export function parseShopeeAds(csvText: string): AdsParseResult {
  const parseResult = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  })

  const allRows = parseResult.data as string[][]

  // Rows 0-5: metadata, Row 6: empty, Row 7: headers, Row 8+: data
  const metaRows = allRows.slice(0, 6)
  const { start: periodStart, end: periodEnd } = extractPeriod(metaRows)

  // Data starts at row 8 (index 8)
  const dataRows = allRows.slice(8).filter((row) => {
    // Filter empty rows
    return row.some((cell) => String(cell ?? '').trim() !== '')
  })

  let shopAggregate: ParsedAdsRow | null = null
  const rows: ParsedAdsRow[] = []

  for (const row of dataRows) {
    if (!row[COL.PRODUCT_CODE]) continue

    const code = String(row[COL.PRODUCT_CODE]).trim()

    // First row with code "-" is the aggregate "Shop GMV Max" row
    if (code === '-') {
      shopAggregate = rowToAdsRow(row)
      continue
    }

    if (!code) continue
    rows.push(rowToAdsRow(row))
  }

  return { rows, shopAggregate, periodStart, periodEnd }
}
