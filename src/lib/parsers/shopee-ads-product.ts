import Papa from 'papaparse'
import type { AdsParseResult, ParsedAdsRow } from '@/types'

// Column indices for "GMV Max Auto per Produk" format (0-based)
// Headers: Urutan | Nama Produk | Kode Produk | Dilihat | Jumlah Klik | Persentase Klik |
//          Konversi | Konversi Langsung | Tingkat konversi | Tingkat Konversi Langsung |
//          Biaya per Konversi | Biaya per Konversi Langsung | Produk Terjual | Terjual Langsung |
//          Omzet Penjualan | Penjualan Langsung (GMV Langsung) | Biaya | Efektifitas Iklan |
//          Efektivitas Langsung | ACOS | ACOS Langsung | Voucher Amount | Vouchered Sales
const COL = {
  RANK: 0,
  PRODUCT_NAME: 1,
  PRODUCT_CODE: 2,
  IMPRESSIONS: 3,
  CLICKS: 4,
  CTR: 5,
  CONVERSIONS: 6,
  DIRECT_CONVERSIONS: 7,
  CONVERSION_RATE: 8,
  DIRECT_CONVERSION_RATE: 9,
  COST_PER_CONVERSION: 10,
  COST_PER_DIRECT_CONVERSION: 11,
  UNITS_SOLD: 12,
  DIRECT_UNITS_SOLD: 13,
  GMV: 14,
  DIRECT_GMV: 15,
  AD_SPEND: 16,
  ROAS: 17,
  DIRECT_ROAS: 18,
  ACOS: 19,
  DIRECT_ACOS: 20,
  VOUCHER_AMOUNT: 21,
  VOUCHERED_SALES: 22,
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

// Extract period from allRows[5][1]: "01/04/2026 - 14/04/2026"
function extractPeriod(allRows: string[][]): { start: string | null; end: string | null } {
  // Row 5 contains the period value at index 1
  const periodRow = allRows[5]
  if (periodRow) {
    const val = String(periodRow[1] ?? '').trim()
    if (val) {
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
    product_name: parseStr(row[COL.PRODUCT_NAME]), // Nama Produk (actual product name)
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

export function parseShopeeAdsProduct(csvText: string): AdsParseResult {
  const parseResult = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  })

  const allRows = parseResult.data as string[][]

  // Row 0: "Shop GMV Max - Shopee Indonesia"
  // Rows 1-5: metadata, Row 6: empty, Row 7: headers, Data from row 8
  const { start: periodStart, end: periodEnd } = extractPeriod(allRows)

  // Data starts at row 8 (index 8)
  const dataRows = allRows.slice(8).filter((row) =>
    row.some((cell) => String(cell ?? '').trim() !== '')
  )

  let shopAggregate: ParsedAdsRow | null = null
  const rows: ParsedAdsRow[] = []

  for (const row of dataRows) {
    if (!row[COL.PRODUCT_CODE] && !row[COL.PRODUCT_NAME]) continue

    const code = String(row[COL.PRODUCT_CODE] ?? '').trim()

    // Aggregate row (code = "-") — capture separately, skip from per-product
    if (code === '-') {
      shopAggregate = rowToAdsRow(row)
      continue
    }

    // Only keep rows that have a real product code
    if (!code) continue
    rows.push(rowToAdsRow(row))
  }

  // Recompute all derived metrics from raw sums for consistency
  for (const r of rows) {
    r.roas = r.ad_spend > 0 ? r.gmv / r.ad_spend : 0
    r.direct_roas = r.ad_spend > 0 ? r.direct_gmv / r.ad_spend : 0
    r.acos = r.gmv > 0 ? r.ad_spend / r.gmv : 0
    r.direct_acos = r.direct_gmv > 0 ? r.ad_spend / r.direct_gmv : 0
    r.ctr = r.impressions > 0 ? r.clicks / r.impressions : 0
    r.conversion_rate = r.clicks > 0 ? r.conversions / r.clicks : 0
    r.direct_conversion_rate = r.clicks > 0 ? r.direct_conversions / r.clicks : 0
    r.cost_per_conversion = r.conversions > 0 ? r.ad_spend / r.conversions : 0
    r.cost_per_direct_conversion = r.direct_conversions > 0 ? r.ad_spend / r.direct_conversions : 0
  }

  return { rows, shopAggregate, periodStart, periodEnd }
}
