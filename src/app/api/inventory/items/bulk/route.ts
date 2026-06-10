import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type ItemType = 'raw_material' | 'semi_finished' | 'finished_good'

/** Buang "Rp", spasi, dan titik ribuan; koma → titik desimal. */
function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw
    .replace(/rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Cari index kolom dari header berdasarkan kata kunci (case-insensitive). */
function findCol(header: string[], ...keywords: string[]): number {
  return header.findIndex((h) => {
    const v = String(h ?? '').toLowerCase()
    return keywords.some((k) => v.includes(k))
  })
}

/** Map teks tipe (Indonesia) ke enum item. Default 'finished_good'. */
function parseType(value: unknown): ItemType {
  const v = String(value ?? '').toLowerCase()
  if (v.includes('mentah') || v.includes('baku') || v.includes('raw')) return 'raw_material'
  if (v.includes('setengah') || v.includes('semi')) return 'semi_finished'
  return 'finished_good'
}

/**
 * POST /api/inventory/items/bulk
 *
 * Terima file Excel hasil edit dari template Master Item, lalu tambah/update
 * item. Pencocokan item yang sudah ada via SKU (lalu fallback Nama).
 * Setelah update, HPP & packaging disinkronkan ke master_products ter-link
 * (satu UPDATE bulk per item). Order HPP di-refresh lewat tombol
 * "Recalculate HPP" di halaman Upload (recalc tidak dijalankan di sini agar cepat).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const access = await getCurrentUserAccess(supabase)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File tidak ditemukan. Pilih file Excel template.' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ error: 'Format harus Excel (.xlsx). CSV tidak didukung.' }, { status: 400 })
    }

    // --- Parse Excel ---------------------------------------------------------
    const buf = Buffer.from(await file.arrayBuffer())
    let wb: XLSX.WorkBook
    try {
      wb = XLSX.read(buf, { type: 'buffer' })
    } catch {
      return NextResponse.json({ error: 'File Excel tidak bisa dibaca. Pastikan filenya valid.' }, { status: 400 })
    }

    // Ambil sheet pertama yang punya kolom Nama.
    const sheetName = wb.SheetNames.find((sn) => {
      const sheet = wb.Sheets[sn]
      const r = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      const h = (r[0] ?? []).map((c) => String(c ?? ''))
      return findCol(h, 'nama') !== -1
    }) ?? wb.SheetNames[0]

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File kosong — tidak ada baris data untuk diproses.' }, { status: 400 })
    }

    const header = (rows[0] as unknown[]).map((c) => String(c ?? ''))
    const nameCol = findCol(header, 'nama')
    const skuCol = findCol(header, 'sku')
    const typeCol = findCol(header, 'tipe', 'type')
    const unitCol = findCol(header, 'satuan', 'unit')
    const hppCol = findCol(header, 'hpp', 'harga', 'cost')
    const packCol = findCol(header, 'packaging', 'packing', 'kemasan')
    const minStockCol = findCol(header, 'stok minimum', 'min stock', 'stok min')
    const notesCol = findCol(header, 'catatan', 'notes')

    if (nameCol === -1) {
      return NextResponse.json(
        { error: 'Kolom wajib tidak ditemukan. Pakai template resmi (harus ada kolom "Nama").' },
        { status: 400 }
      )
    }

    type Parsed = {
      name: string
      sku: string
      type: ItemType
      unit: string
      hpp: number | null
      packaging: number | null
      minStock: number | null
      notes: string
      hppProvided: boolean
      packProvided: boolean
      minStockProvided: boolean
    }
    const parsed: Parsed[] = []
    let invalidRows = 0

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      const name = String(row[nameCol] ?? '').trim()
      if (!name) continue

      const sku = skuCol !== -1 ? String(row[skuCol] ?? '').trim() : ''
      const unit = unitCol !== -1 ? String(row[unitCol] ?? '').trim() : ''
      const notes = notesCol !== -1 ? String(row[notesCol] ?? '').trim() : ''
      const type = typeCol !== -1 ? parseType(row[typeCol]) : 'finished_good'

      const hppRaw = hppCol !== -1 ? row[hppCol] : undefined
      const packRaw = packCol !== -1 ? row[packCol] : undefined
      const minRaw = minStockCol !== -1 ? row[minStockCol] : undefined
      const hppProvided = !(hppRaw === null || hppRaw === undefined || String(hppRaw).trim() === '')
      const packProvided = !(packRaw === null || packRaw === undefined || String(packRaw).trim() === '')
      const minStockProvided = !(minRaw === null || minRaw === undefined || String(minRaw).trim() === '')

      const hpp = hppProvided ? parseMoney(hppRaw) : null
      const packaging = packProvided ? parseMoney(packRaw) : null
      const minStock = minStockProvided ? parseMoney(minRaw) : null

      if (
        (hppProvided && hpp === null) ||
        (packProvided && packaging === null) ||
        (minStockProvided && minStock === null)
      ) {
        invalidRows++
        continue
      }

      parsed.push({
        name, sku, type, unit,
        hpp, packaging, minStock, notes,
        hppProvided, packProvided, minStockProvided,
      })
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris data yang bisa diproses.', invalidRows }, { status: 400 })
    }

    // --- Ambil item milik user untuk pencocokan ------------------------------
    const { data: existing, error: existErr } = await supabase
      .from('items')
      .select('id, name, sku, cost_per_unit, packaging_cost')
      .eq('user_id', access.user.id)
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 })

    type ItemRow = { id: string; name: string; sku: string | null; cost_per_unit: number | null; packaging_cost: number | null }
    const items = (existing ?? []) as ItemRow[]
    const bySku = new Map<string, ItemRow>()
    const byName = new Map<string, ItemRow>()
    for (const it of items) {
      if (it.sku) bySku.set(it.sku.trim().toLowerCase(), it)
      byName.set(it.name.trim().toLowerCase(), it)
    }

    let updated = 0
    let created = 0
    let unchanged = 0
    const createFailed: string[] = []
    const updateFailed: string[] = []
    // Item id → nilai HPP/packaging baru untuk sinkronisasi ke master_products.
    const syncCost = new Map<string, { hpp: number; packaging: number }>()

    for (const row of parsed) {
      const match =
        (row.sku ? bySku.get(row.sku.toLowerCase()) : undefined) ??
        byName.get(row.name.toLowerCase())

      if (match) {
        // Update item yang ada. Field kosong tidak menimpa nilai lama.
        const patch: Record<string, unknown> = {}
        if (row.hppProvided) patch.cost_per_unit = row.hpp
        if (row.packProvided) patch.packaging_cost = row.packaging
        if (row.minStockProvided) patch.min_stock_qty = row.minStock
        if (row.unit) patch.unit = row.unit
        if (typeCol !== -1) patch.type = row.type
        if (row.notes) patch.notes = row.notes

        if (Object.keys(patch).length === 0) { unchanged++; continue }

        const { error: updErr } = await supabase
          .from('items')
          .update(patch)
          .eq('id', match.id)
          .eq('user_id', access.user.id)
        if (updErr) { updateFailed.push(row.name); continue }
        updated++

        if (row.hppProvided || row.packProvided) {
          syncCost.set(match.id, {
            hpp: row.hppProvided ? (row.hpp as number) : Number(match.cost_per_unit ?? 0),
            packaging: row.packProvided ? (row.packaging as number) : Number(match.packaging_cost ?? 0),
          })
        }
      } else {
        // Item baru.
        const { data: inserted, error: insErr } = await supabase
          .from('items')
          .insert({
            user_id: access.user.id,
            store_id: null,
            name: row.name,
            sku: row.sku || null,
            type: row.type,
            unit: row.unit || 'pcs',
            cost_per_unit: row.hpp ?? 0,
            packaging_cost: row.packaging ?? 0,
            min_stock_qty: row.minStock ?? 0,
            notes: row.notes || null,
          })
          .select('id')
          .single()
        if (insErr || !inserted) { createFailed.push(row.name); continue }
        created++
      }
    }

    // --- Sinkronkan HPP & packaging ke master_products ter-link --------------
    // (satu UPDATE per item; tidak menjalankan recalc order agar tetap cepat).
    for (const [itemId, vals] of Array.from(syncCost.entries())) {
      await supabase
        .from('master_products')
        .update({ hpp: vals.hpp, packaging_cost: vals.packaging })
        .eq('linked_item_id', itemId)
    }

    return NextResponse.json({
      success: true,
      updated,
      created,
      unchanged,
      updateFailedCount: updateFailed.length,
      createFailedCount: createFailed.length,
      invalidRows,
    })
  } catch (error) {
    console.error('Bulk upload items error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    )
  }
}
