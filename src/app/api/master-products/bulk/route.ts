import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'
import { listAccessibleStores } from '@/lib/store-access'

/** Buang "Rp", spasi, dan titik ribuan; koma → titik desimal. */
function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  // Hilangkan simbol & pemisah ribuan, samakan desimal ke titik.
  const cleaned = raw
    .replace(/rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // titik ribuan
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

/**
 * POST /api/master-products/bulk
 *
 * Terima file Excel hasil edit dari template, cocokkan tiap baris ke produk
 * (via kolom ID Produk = marketplace_product_id), lalu update HPP & Packaging.
 * Hanya MEMPERBARUI produk yang sudah ada — tidak membuat produk baru.
 *
 * FormData: file (xlsx). Query opsional: store, marketplace (untuk scoping match).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store')
    const marketplace = normalizeMarketplaceFilter(searchParams.get('marketplace'))

    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File tidak ditemukan. Pilih file Excel template.' }, { status: 400 })
    }

    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
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

    // Ambil sheet pertama yang punya kolom HPP — biasanya "Master Produk".
    const sheetName = wb.SheetNames.find((sn) => {
      const ws = wb.Sheets[sn]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
      const header = (rows[0] ?? []).map((c) => String(c ?? ''))
      return findCol(header, 'hpp') !== -1 && findCol(header, 'id produk', 'id') !== -1
    }) ?? wb.SheetNames[0]

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File kosong — tidak ada baris data untuk diproses.' }, { status: 400 })
    }

    const header = (rows[0] as unknown[]).map((c) => String(c ?? ''))
    const idCol = findCol(header, 'id produk', 'id')
    const hppCol = findCol(header, 'hpp')
    const packCol = findCol(header, 'packaging', 'packing', 'kemasan')
    const nameCol = findCol(header, 'nama')
    const skuCol = findCol(header, 'sku')

    if (idCol === -1 || hppCol === -1) {
      return NextResponse.json(
        { error: 'Kolom wajib tidak ditemukan. Pakai template resmi (harus ada kolom "ID Produk" dan "HPP (Rp)").' },
        { status: 400 }
      )
    }

    // Kumpulkan baris: butuh ID. Catat apakah HPP/Packaging diisi (untuk update),
    // serta nama & SKU (untuk produk baru).
    type Parsed = {
      id: string
      name: string
      sku: string
      hpp: number | null
      packaging: number | null
      hppProvided: boolean
      packProvided: boolean
    }
    const parsed: Parsed[] = []
    let invalidRows = 0

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      const id = String(row[idCol] ?? '').trim()
      if (!id) continue

      const name = nameCol !== -1 ? String(row[nameCol] ?? '').trim() : ''
      const sku = skuCol !== -1 ? String(row[skuCol] ?? '').trim() : ''
      const hppRaw = row[hppCol]
      const packRaw = packCol !== -1 ? row[packCol] : undefined
      const hppProvided = !(hppRaw === null || hppRaw === undefined || String(hppRaw).trim() === '')
      const packProvided = !(packRaw === null || packRaw === undefined || String(packRaw).trim() === '')

      const hpp = hppProvided ? parseMoney(hppRaw) : null
      const packaging = packProvided ? parseMoney(packRaw) : null

      if ((hppProvided && hpp === null) || (packProvided && packaging === null)) {
        invalidRows++
        continue
      }

      parsed.push({ id, name, sku, hpp, packaging, hppProvided, packProvided })
    }

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada baris data yang bisa diproses.', invalidRows },
        { status: 400 }
      )
    }

    // --- Cocokkan ke produk milik user (RLS sudah membatasi ke user) ---------
    const productQuery = supabase
      .from('master_products')
      .select('id, marketplace_product_id, seller_sku, store_id, hpp, packaging_cost')
    if (storeId) productQuery.eq('store_id', storeId)
    if (marketplace) productQuery.eq('marketplace', marketplace)

    const { data: products, error: prodError } = await productQuery
    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 500 })
    }

    type Prod = { id: string; marketplace_product_id: string; seller_sku: string | null; store_id: string | null; hpp: number | null; packaging_cost: number | null }
    const typedProducts = (products ?? []) as Prod[]

    // Index by marketplace_product_id dan seller_sku (fallback) — semua lowercase.
    const byId = new Map<string, Prod>()
    for (const p of typedProducts) {
      byId.set(p.marketplace_product_id.toLowerCase(), p)
      if (p.seller_sku) byId.set(p.seller_sku.toLowerCase(), p)
    }

    // Pisahkan: baris yang cocok → update; baris tak cocok → kandidat produk baru.
    const updateByProductId = new Map<string, { hpp: number; packaging_cost: number }>()
    const affectedStores = new Set<string | null>()
    type NewProduct = { id: string; name: string; sku: string; hpp: number; packaging: number }
    const toCreate: NewProduct[] = []
    const createDedupe = new Set<string>()
    const skippedNoName: string[] = []
    let unchanged = 0

    for (const row of parsed) {
      const prod =
        byId.get(row.id.toLowerCase()) ??
        (row.sku ? byId.get(row.sku.toLowerCase()) : undefined)

      if (prod) {
        // Produk sudah ada → update. Field yang kosong tidak menimpa nilai lama.
        if (!row.hppProvided && !row.packProvided) {
          unchanged++
          continue
        }
        const current = updateByProductId.get(prod.id)
        updateByProductId.set(prod.id, {
          hpp: row.hppProvided ? (row.hpp as number) : current?.hpp ?? Number(prod.hpp ?? 0),
          packaging_cost: row.packProvided ? (row.packaging as number) : current?.packaging_cost ?? Number(prod.packaging_cost ?? 0),
        })
        affectedStores.add(prod.store_id)
      } else {
        // Produk baru → wajib ada nama. Tanpa nama tidak bisa dibuat.
        if (!row.name) {
          if (!skippedNoName.includes(row.id)) skippedNoName.push(row.id)
          continue
        }
        const key = row.id.toLowerCase()
        if (createDedupe.has(key)) continue
        createDedupe.add(key)
        toCreate.push({ id: row.id, name: row.name, sku: row.sku, hpp: row.hpp ?? 0, packaging: row.packaging ?? 0 })
      }
    }

    // --- Resolusi toko tujuan untuk produk baru ------------------------------
    let targetStoreId: string | null = null
    let targetMarketplace: string = marketplace ?? 'shopee'
    let createBlocked: string | null = null

    if (toCreate.length > 0) {
      if (storeId) {
        const { data: store } = await supabase
          .from('stores')
          .select('id, marketplace')
          .eq('id', storeId)
          .maybeSingle()
        if (store) {
          targetStoreId = store.id as string
          targetMarketplace = (store.marketplace as string) ?? targetMarketplace
        }
      } else {
        const stores = await listAccessibleStores(supabase, user.id)
        const candidates = marketplace ? stores.filter((s) => s.marketplace === marketplace) : stores
        if (candidates.length === 1) {
          targetStoreId = candidates[0].id
          targetMarketplace = candidates[0].marketplace ?? targetMarketplace
        } else if (candidates.length > 1) {
          createBlocked = 'Kamu punya beberapa toko. Pilih satu toko di filter atas dulu supaya produk baru masuk ke toko yang benar.'
        }
        // 0 toko → biarkan store_id null, marketplace dari filter/default.
      }
    }

    // --- Terapkan update -----------------------------------------------------
    let updated = 0
    for (const [productId, vals] of Array.from(updateByProductId.entries())) {
      const { error: updErr } = await supabase
        .from('master_products')
        .update({ hpp: vals.hpp, packaging_cost: vals.packaging_cost })
        .eq('id', productId)
      if (updErr) {
        return NextResponse.json({ error: `Gagal menyimpan sebagian data: ${updErr.message}`, updated }, { status: 500 })
      }
      updated++
    }

    // --- Buat produk baru ----------------------------------------------------
    let created = 0
    const createFailed: string[] = []
    if (toCreate.length > 0 && !createBlocked) {
      for (const np of toCreate) {
        const numericId = /^\d+$/.test(np.id) ? np.id : null
        const { error: insErr } = await supabase
          .from('master_products')
          .insert({
            user_id: user.id,
            store_id: targetStoreId,
            marketplace_product_id: np.id,
            seller_sku: np.sku || null,
            numeric_id: numericId,
            product_name: np.name,
            source_tags: [],
            marketplace: targetMarketplace,
            hpp: np.hpp,
            packaging_cost: np.packaging,
          })
        if (insErr) {
          if (!createFailed.includes(np.id)) createFailed.push(np.id)
          continue
        }
        created++
        affectedStores.add(targetStoreId)
      }
    }

    // --- Recalc estimated HPP per store yang terdampak -----------------------
    const warnings = new Set<string>()
    const scopes = affectedStores.has(null) ? [null] : Array.from(affectedStores)
    for (const scope of scopes) {
      const result = await recalculateEstimatedHppForStore(supabase, scope)
      result.warnings.forEach((w) => warnings.add(w))
    }

    return NextResponse.json({
      success: true,
      updated,
      created,
      unchanged,
      createBlockedCount: createBlocked ? toCreate.length : 0,
      createBlocked,
      createFailedCount: createFailed.length,
      createFailed: createFailed.slice(0, 20),
      skippedNoNameCount: skippedNoName.length,
      invalidRows,
      warnings: Array.from(warnings),
    })
  } catch (error) {
    console.error('Bulk upload master-products error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    )
  }
}
