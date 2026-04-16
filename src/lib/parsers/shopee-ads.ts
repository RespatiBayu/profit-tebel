import Papa from 'papaparse'
import type { AdsParseResult, ParsedAdsRow } from '@/types'

// Column indices in NEW format data rows (0-based)
// Format: Urutan | Nama Iklan | Status | Kode Produk | Mode Bidding | Penempatan Iklan |
//         Tanggal Mulai | Tanggal Selesai | Dilihat | Jumlah Klik | Persentase Klik |
//         Konversi | Konversi Langsung | Tingkat konversi | Tingkat Konversi Langsung |
//         Biaya per Konversi | Biaya per Konversi Langsung | Produk Terjual | Terjual Langsung |
//         Omzet Penjualan | Penjualan Langsung | Biaya | Efektifitas Iklan | Efektivitas Langsung |
//         ACOS | ACOS Langsung | Voucher Amount | Vouchered Sales
const COL = {
  RANK: 0,
  AD_NAME: 1,
  STATUS: 2,
  PRODUCT_CODE: 3,
  BIDDING_MODE: 4,
  PLACEMENT: 5,
  START_DATE: 6,
  END_DATE: 7,
  IMPRESSIONS: 8,
  CLICKS: 9,
  CTR: 10,
  CONVERSIONS: 11,
  DIRECT_CONVERSIONS: 12,
  CONVERSION_RATE: 13,
  DIRECT_CONVERSION_RATE: 14,
  COST_PER_CONVERSION: 15,
  COST_PER_DIRECT_CONVERSION: 16,
  UNITS_SOLD: 17,
  DIRECT_UNITS_SOLD: 18,
  GMV: 19,
  DIRECT_GMV: 20,
  AD_SPEND: 21,
  ROAS: 22,
  DIRECT_ROAS: 23,
  ACOS: 24,
  DIRECT_ACOS: 25,
  VOUCHER_AMOUNT: 26,
  VOUCHERED_SALES: 27,
} as const

function parseNum(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '-') return 0
  let str = String(value).trim()

  // Strip "%" suffix
  str = str.replace(/%$/, '')

  // Handle Indonesian number format: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    str = str.replace(/[^\d.-]/g, '')
  }

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function parsePercent(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '-') return 0
  const str = String(value).replace(/%$/, '').trim()
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

// Extract period from row index 5 ("Periode,01/03/2026 - 31/03/2026")
// Falls back to scanning all metadata rows if not found
function extractPeriod(allRows: string[][]): { start: string | null; end: string | null } {
  // Try dedicated row first (row 5 key = "Periode")
  const periodRow = allRows[5]
  if (periodRow) {
    const key = String(periodRow[0] ?? '').trim()
    const val = String(periodRow[1] ?? '').trim()
    if (key === 'Periode' && val) {
      const parsed = parsePeriodString(val)
      if (parsed.start) return parsed
    }
  }

  // Fallback: scan metadata rows 0-9 for any date range pattern
  const metaText = (allRows.slice(0, 10) ?? []).flat().join(' ')
  return parsePeriodString(metaText)
}

function parsePeriodString(text: string): { start: string | null; end: string | null } {
  // DD/MM/YYYY - DD/MM/YYYY
  const m1 = text.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/)
  if (m1) {
    return {
      start: dmyToIso(m1[1]),
      end: dmyToIso(m1[2]),
    }
  }
  // YYYY-MM-DD - YYYY-MM-DD
  const m2 = text.match(/(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})/)
  if (m2) return { start: m2[1], end: m2[2] }
  return { start: null, end: null }
}

function dmyToIso(dmy: string): string {
  const [d, m, y] = dmy.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function rowToAdsRow(row: string[]): ParsedAdsRow {
  return {
    product_name: parseStr(row[COL.AD_NAME]),       // Nama Iklan (ad name)
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

  // Metadata rows 0-7, row 8 = empty, row 9 = headers, row 10+ = data
  const { start: periodStart, end: periodEnd } = extractPeriod(allRows)

  // Data starts at row 10 (index 10)
  const dataRows = allRows.slice(10).filter((row) =>
    row.some((cell) => String(cell ?? '').trim() !== '')
  )

  let shopAggregate: ParsedAdsRow | null = null
  const rows: ParsedAdsRow[] = []

  for (const row of dataRows) {
    if (!row[COL.PRODUCT_CODE]) continue

    const code = String(row[COL.PRODUCT_CODE]).trim()

    // Aggregate row (code = "-") — capture separately, skip from per-product
    if (code === '-') {
      shopAggregate = rowToAdsRow(row)
      continue
    }

    // Only keep rows that have a real product code
    if (!code) continue
    rows.push(rowToAdsRow(row))
  }

  return { rows, shopAggregate, periodStart, periodEnd }
}
