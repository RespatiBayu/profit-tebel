import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'

/**
 * GET /api/master-products/template
 *
 * Generate an Excel (.xlsx) template untuk bulk update HPP & Packaging.
 * Template sudah terisi produk milik user (sesuai filter toko/marketplace),
 * lengkap dengan HPP & Packaging saat ini — user tinggal edit angkanya di
 * Excel lalu upload balik lewat POST /api/master-products/bulk.
 *
 * Kolom "ID Produk" adalah kunci pencocokan saat upload — JANGAN diubah.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store')
  const marketplace = normalizeMarketplaceFilter(searchParams.get('marketplace'))

  const query = supabase
    .from('master_products')
    .select('marketplace_product_id, seller_sku, product_name, hpp, packaging_cost')
    .order('product_name', { ascending: true })

  if (storeId) query.eq('store_id', storeId)
  if (marketplace) query.eq('marketplace', marketplace)

  const { data: products, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    marketplace_product_id: string
    seller_sku: string | null
    product_name: string
    hpp: number | null
    packaging_cost: number | null
  }
  const rows = (products ?? []) as Row[]

  // --- Sheet 1: Master Produk (data yang diedit) -----------------------------
  const HEADER = ['ID Produk (jangan diubah)', 'SKU Seller', 'Nama Produk', 'HPP (Rp)', 'Packaging (Rp)']
  const aoa: (string | number)[][] = [HEADER]
  for (const r of rows) {
    aoa.push([
      r.marketplace_product_id,
      r.seller_sku ?? '',
      r.product_name,
      Number(r.hpp ?? 0),
      Number(r.packaging_cost ?? 0),
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Paksa kolom ID & SKU sebagai teks supaya ID panjang tidak dibulatkan Excel.
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of [0, 1]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      if (cell) { cell.t = 's'; cell.v = String(cell.v ?? '') }
    }
  }

  ws['!cols'] = [
    { wch: 22 }, // ID Produk
    { wch: 24 }, // SKU Seller
    { wch: 52 }, // Nama Produk
    { wch: 14 }, // HPP
    { wch: 16 }, // Packaging
  ]

  // --- Sheet 2: Petunjuk ------------------------------------------------------
  const guide = XLSX.utils.aoa_to_sheet([
    ['Cara pakai template Master Produk (update + tambah produk baru)'],
    [''],
    ['== MENGUBAH PRODUK YANG SUDAH ADA =='],
    ['1. Isi/edit kolom "HPP (Rp)" dan "Packaging (Rp)" di sheet "Master Produk".'],
    ['2. Gunakan angka saja (tanpa "Rp" atau titik ribuan). Contoh: 22000'],
    ['3. JANGAN mengubah kolom "ID Produk" — itu kunci pencocokan saat upload.'],
    ['4. Baris yang HPP & Packaging-nya kosong akan dilewati (tidak diubah).'],
    [''],
    ['== MENAMBAH PRODUK BARU =='],
    ['1. Tambahkan baris baru di bawah daftar yang ada.'],
    ['2. Isi "ID Produk" (kode unik produk, mis. Product ID Shopee atau kode SKU) dan "Nama Produk". Keduanya WAJIB.'],
    ['3. Isi "SKU Seller" bila ada (opsional) supaya gampang dicocokkan dengan data penjualan nanti.'],
    ['4. Isi "HPP (Rp)" & "Packaging (Rp)" bila sudah tahu (boleh dikosongkan, default 0).'],
    ['5. Produk baru akan masuk ke toko yang sedang dipilih di filter atas. Kalau punya banyak toko, pilih satu toko dulu sebelum upload.'],
    [''],
    ['Terakhir: simpan sebagai .xlsx, lalu upload lewat tombol "Upload Excel" di halaman Master Produk.'],
  ])
  guide['!cols'] = [{ wch: 100 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master Produk')
  XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const body = new Uint8Array(buf)

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="template-master-produk-${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
