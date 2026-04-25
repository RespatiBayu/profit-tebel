import Papa from 'papaparse'
import type { AdsParseResult, ParsedAdsRow } from '@/types'

/**
 * Parser "Semua Laporan Iklan CPC" dari Shopee Seller Centre.
 *
 * Shopee suka nambah/ngurangin kolom antar versi export (misal tambah
 * "Jenis Iklan", "Tampilan Iklan", "Jumlah Produk Dilihat"). Biar ga brittle,
 * parser ini cari header row secara dinamis (row yang dimulai "Urutan") lalu
 * map tiap kolom by nama-nya, bukan by posisi hardcoded.
 */

// Mapping nama kolom header → key internal. Pakai lowercase + trim buat match.
// Kalau Shopee rename kolom, tambahin alias di array-nya.
const HEADER_ALIASES: Record<string, string[]> = {
  ad_name: ['nama iklan'],
  ad_status: ['status'],
  product_code: ['kode produk'],
  impressions: ['dilihat', 'iklan dilihat'],
  clicks: ['jumlah klik'],
  ctr: ['persentase klik'],
  conversions: ['konversi'],
  direct_conversions: ['konversi langsung'],
  conversion_rate: ['tingkat konversi'],
  direct_conversion_rate: ['tingkat konversi langsung'],
  cost_per_conversion: ['biaya per konversi'],
  cost_per_direct_conversion: ['biaya per konversi langsung'],
  units_sold: ['produk terjual'],
  direct_units_sold: ['terjual langsung'],
  gmv: ['omzet penjualan', 'penjualan dari iklan'],
  direct_gmv: [
    'penjualan langsung (gmv langsung)',
    'penjualan langsung',
    'gmv langsung',
  ],
  ad_spend: ['biaya'],
  roas: ['efektifitas iklan', 'efektivitas iklan', 'roas'],
  direct_roas: ['efektivitas langsung', 'efektifitas langsung', 'roas langsung'],
  acos: [
    'persentase biaya iklan terhadap penjualan dari iklan (acos)',
    'acos',
  ],
  direct_acos: [
    'persentase biaya iklan terhadap penjualan dari iklan langsung (acos langsung)',
    'acos langsung',
  ],
  voucher_amount: ['voucher amount', 'jumlah voucher'],
  vouchered_sales: ['vouchered sales', 'penjualan voucher'],
}

type ColMap = Record<string, number>

function normalizeHeader(s: string): string {
  return String(s ?? '').trim().toLowerCase()
}

function buildColMap(headerRow: string[]): ColMap {
  const map: ColMap = {}
  const normalized = headerRow.map(normalizeHeader)
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias)
      if (idx !== -1) {
        map[key] = idx
        break
      }
    }
  }
  return map
}

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

/** Helper: ambil nilai kolom by key dari col map. Return '' kalau header missing. */
function cell(row: string[], cols: ColMap, key: string): string {
  const idx = cols[key]
  if (idx === undefined) return ''
  return row[idx] ?? ''
}

// Extract period from metadata rows (search for "Periode" key or DD/MM/YYYY range)
function extractPeriod(allRows: string[][]): { start: string | null; end: string | null } {
  // Scan first 10 rows
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i]
    if (!row) continue
    const key = String(row[0] ?? '').trim().toLowerCase()
    if (key === 'periode') {
      const val = String(row[1] ?? '').trim()
      const parsed = parsePeriodString(val)
      if (parsed.start) return parsed
    }
  }
  // Fallback: scan full metadata text for date range
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

function rowToAdsRow(row: string[], cols: ColMap): ParsedAdsRow {
  const adName = parseStr(cell(row, cols, 'ad_name'))
  return {
    ad_name: adName,
    parent_iklan: null,
    ad_status: parseStr(cell(row, cols, 'ad_status')),
    product_name: adName,
    product_code: String(cell(row, cols, 'product_code')).trim(),
    impressions: Math.round(parseNum(cell(row, cols, 'impressions'))),
    clicks: Math.round(parseNum(cell(row, cols, 'clicks'))),
    ctr: parsePercent(cell(row, cols, 'ctr')),
    conversions: Math.round(parseNum(cell(row, cols, 'conversions'))),
    direct_conversions: Math.round(parseNum(cell(row, cols, 'direct_conversions'))),
    conversion_rate: parsePercent(cell(row, cols, 'conversion_rate')),
    direct_conversion_rate: parsePercent(cell(row, cols, 'direct_conversion_rate')),
    cost_per_conversion: parseNum(cell(row, cols, 'cost_per_conversion')),
    cost_per_direct_conversion: parseNum(cell(row, cols, 'cost_per_direct_conversion')),
    units_sold: Math.round(parseNum(cell(row, cols, 'units_sold'))),
    direct_units_sold: Math.round(parseNum(cell(row, cols, 'direct_units_sold'))),
    gmv: parseNum(cell(row, cols, 'gmv')),
    direct_gmv: parseNum(cell(row, cols, 'direct_gmv')),
    ad_spend: parseNum(cell(row, cols, 'ad_spend')),
    roas: parseNum(cell(row, cols, 'roas')),
    direct_roas: parseNum(cell(row, cols, 'direct_roas')),
    acos: parsePercent(cell(row, cols, 'acos')),
    direct_acos: parsePercent(cell(row, cols, 'direct_acos')),
    voucher_amount: parseNum(cell(row, cols, 'voucher_amount')),
    vouchered_sales: parseNum(cell(row, cols, 'vouchered_sales')),
  }
}

/** Cari row yang kemungkinan besar adalah header (dimulai "Urutan" / "No."). */
function findHeaderRowIdx(allRows: string[][]): number {
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const first = normalizeHeader(allRows[i]?.[0] ?? '')
    if (first === 'urutan' || first === 'no.' || first === 'no') {
      // Pastikan ada kolom "Nama Iklan" di row yg sama biar ga false positive
      const hasAdName = (allRows[i] ?? []).some(
        (c) => normalizeHeader(c) === 'nama iklan'
      )
      if (hasAdName) return i
    }
  }
  return -1
}

export function parseShopeeAds(csvText: string): AdsParseResult {
  const parseResult = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  })

  const allRows = parseResult.data as string[][]
  const { start: periodStart, end: periodEnd } = extractPeriod(allRows)

  // Auto-detect header row (robust ke perubahan jumlah metadata row antar versi).
  const headerIdx = findHeaderRowIdx(allRows)
  if (headerIdx === -1) {
    throw new Error(
      'Header "Urutan, Nama Iklan, …" tidak ditemukan. Pastikan file CSV adalah "Semua Laporan Iklan CPC" dari Shopee Seller Centre.'
    )
  }

  const cols = buildColMap(allRows[headerIdx])
  if (cols.ad_name === undefined || cols.product_code === undefined || cols.ad_spend === undefined) {
    throw new Error(
      'Kolom wajib (Nama Iklan / Kode Produk / Biaya) tidak ditemukan di header. Kemungkinan format file berubah.'
    )
  }

  // Data rows = setelah header
  const dataRows = allRows.slice(headerIdx + 1).filter((row) =>
    row.some((cell) => String(cell ?? '').trim() !== '')
  )

  let shopAggregate: ParsedAdsRow | null = null
  const rows: ParsedAdsRow[] = []

  for (const row of dataRows) {
    const rawCode = cell(row, cols, 'product_code')
    if (!rawCode) continue
    const code = String(rawCode).trim()

    // Aggregate row (code = "-") — capture separately, skip from per-product
    if (code === '-') {
      shopAggregate = rowToAdsRow(row, cols)
      continue
    }
    if (!code) continue
    rows.push(rowToAdsRow(row, cols))
  }

  return { rows, shopAggregate, periodStart, periodEnd, parentIklan: null }
}
