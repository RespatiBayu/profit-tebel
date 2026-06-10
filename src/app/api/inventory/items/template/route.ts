import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

const TYPE_LABEL: Record<string, string> = {
  raw_material: 'Bahan Mentah',
  semi_finished: 'Setengah Jadi',
  finished_good: 'Barang Jadi',
}

/**
 * GET /api/inventory/items/template
 *
 * Generate Excel (.xlsx) template untuk bulk tambah/update Master Item.
 * Template terisi item milik user saat ini (Nama, SKU, Tipe, Satuan, HPP,
 * Packaging, Stok Minimum, Catatan) — user tinggal edit lalu upload balik
 * lewat POST /api/inventory/items/bulk.
 *
 * Pencocokan saat upload: kolom "SKU" (kalau ada) lalu fallback "Nama".
 */
export async function GET() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Master Item terbuka untuk paket Basic (setup HPP). Tidak butuh subscription Pro.

  const { data: items, error } = await supabase
    .from('items')
    .select('name, sku, type, unit, cost_per_unit, packaging_cost, min_stock_qty')
    .eq('user_id', access.user.id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    name: string
    sku: string | null
    type: string
    unit: string | null
    cost_per_unit: number | null
    packaging_cost: number | null
    min_stock_qty: number | null
  }
  const rows = (items ?? []) as Row[]

  // --- Sheet 1: Master Item (data yang diedit) -------------------------------
  const HEADER = ['Nama', 'SKU', 'Tipe', 'Satuan', 'HPP (Rp)', 'Packaging (Rp)', 'Stok Minimum', 'Catatan']
  const aoa: (string | number)[][] = [HEADER]
  for (const r of rows) {
    aoa.push([
      r.name,
      r.sku ?? '',
      TYPE_LABEL[r.type] ?? 'Barang Jadi',
      r.unit ?? 'pcs',
      Number(r.cost_per_unit ?? 0),
      Number(r.packaging_cost ?? 0),
      Number(r.min_stock_qty ?? 0),
      '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Paksa kolom SKU sebagai teks supaya kode panjang tidak dibulatkan Excel.
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let R = 1; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 1 })
    const cell = ws[addr]
    if (cell) { cell.t = 's'; cell.v = String(cell.v ?? '') }
  }

  ws['!cols'] = [
    { wch: 48 }, // Nama
    { wch: 26 }, // SKU
    { wch: 16 }, // Tipe
    { wch: 10 }, // Satuan
    { wch: 14 }, // HPP
    { wch: 16 }, // Packaging
    { wch: 14 }, // Stok Minimum
    { wch: 30 }, // Catatan
  ]

  // --- Sheet 2: Petunjuk ------------------------------------------------------
  const guide = XLSX.utils.aoa_to_sheet([
    ['Cara pakai template Master Item (tambah + update item)'],
    [''],
    ['== MENGUBAH ITEM YANG SUDAH ADA =='],
    ['1. Edit kolom "HPP (Rp)", "Packaging (Rp)", "Stok Minimum", "Tipe", "Satuan", atau "Catatan".'],
    ['2. Gunakan angka saja (tanpa "Rp" atau titik ribuan). Contoh: 22500'],
    ['3. Pencocokan item memakai kolom "SKU". Kalau SKU kosong, dicocokkan dari "Nama".'],
    ['4. JANGAN mengubah "SKU" item yang sudah ada — itu kunci pencocokan.'],
    [''],
    ['== MENAMBAH ITEM BARU =='],
    ['1. Tambahkan baris baru di bawah daftar yang ada.'],
    ['2. Kolom "Nama" WAJIB diisi. SKU opsional tapi disarankan supaya gampang dicocokkan.'],
    ['3. "Tipe" diisi salah satu: Bahan Mentah, Setengah Jadi, atau Barang Jadi (default Barang Jadi).'],
    ['4. "Satuan" default pcs. Isi HPP/Packaging/Stok Minimum bila sudah tahu (boleh kosong, default 0).'],
    [''],
    ['Terakhir: simpan sebagai .xlsx, lalu upload lewat tombol "Bulk Upload" di halaman Master Item.'],
  ])
  guide['!cols'] = [{ wch: 100 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master Item')
  XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const body = new Uint8Array(buf)

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="template-master-item-${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
