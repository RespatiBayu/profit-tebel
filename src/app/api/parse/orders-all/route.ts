import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseShopeeOrdersAll } from '@/lib/parsers/shopee-orders-all'
import type { UploadSummary } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const marketplace = (formData.get('marketplace') as string) ?? 'shopee'
    let storeId = (formData.get('storeId') as string | null) ?? null

    if (!file) return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 })
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'File harus berformat .xlsx atau .xls' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let parseResult
    try {
      parseResult = parseShopeeOrdersAll(buffer)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Format file tidak valid'
      return NextResponse.json({ error: msg }, { status: 422 })
    }

    const { orders } = parseResult
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    const periodStart = parseResult.periodStart && isoDate.test(parseResult.periodStart)
      ? parseResult.periodStart : null
    const periodEnd = parseResult.periodEnd && isoDate.test(parseResult.periodEnd)
      ? parseResult.periodEnd : null

    if (orders.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data pesanan ditemukan.' }, { status: 422 })
    }

    // Ensure profile
    const serviceClient = await createServiceClient()
    await serviceClient.from('profiles').upsert(
      { id: user.id, email: user.email, is_paid: false },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    // Resolve store
    if (storeId) {
      const { data: s } = await supabase.from('stores').select('id').eq('id', storeId).eq('user_id', user.id).maybeSingle()
      if (!s) storeId = null
    }
    if (!storeId) {
      const { data: def } = await supabase.from('stores').select('id').eq('user_id', user.id).eq('marketplace', marketplace).eq('name', 'Toko Utama').maybeSingle()
      if (def) {
        storeId = def.id
      } else {
        const { data: ns, error: se } = await supabase.from('stores').insert({ user_id: user.id, name: 'Toko Utama', marketplace }).select('id').single()
        if (se || !ns) return NextResponse.json({ error: `Gagal membuat store: ${se?.message}` }, { status: 500 })
        storeId = ns.id
      }
    }

    // Fetch existing order_numbers for this store to compute inserted vs updated counts
    const { data: existing } = await supabase
      .from('orders_all')
      .select('order_number')
      .eq('store_id', storeId!)
    const existingSet = new Set((existing ?? []).map((r) => r.order_number))

    // Upload batch
    const { data: batch, error: batchErr } = await supabase.from('upload_batches').insert({
      user_id: user.id,
      store_id: storeId,
      file_name: file.name,
      file_type: 'orders_all',
      marketplace,
      record_count: orders.length,
      period_start: periodStart,
      period_end: periodEnd,
    }).select('id').single()

    if (batchErr || !batch) {
      return NextResponse.json({ error: `Gagal menyimpan batch: ${batchErr?.message}` }, { status: 500 })
    }

    const warnings: string[] = []

    // Wipe-and-replace: delete all rows in the period's date range so stale data
    // (including old rows missing products_json / seller_voucher) is fully cleared
    // before inserting the fresh version.
    if (periodStart && periodEnd) {
      const { error: delErr } = await supabase
        .from('orders_all')
        .delete()
        .eq('store_id', storeId!)
        .lte('order_date', periodEnd)
        .gte('order_date', periodStart)
      if (delErr) warnings.push(`Gagal menghapus data lama: ${delErr.message}`)
    } else {
      // No date range detected — wipe ALL rows for this store to avoid orphaned data
      const { error: delErr } = await supabase
        .from('orders_all')
        .delete()
        .eq('store_id', storeId!)
      if (delErr) warnings.push(`Gagal menghapus data lama: ${delErr.message}`)
    }

    // --- Server-side HPP estimation (migration 012) ---
    // Cross-reference seller SKU codes (from Order.all products_json) with Shopee numeric IDs
    // (from order_products table keyed by income file). This allows HPP lookup via master_products.
    //
    // Strategy:
    // 1. Collect all order_numbers from parsed orders
    // 2. Query order_products for those order_numbers → get numeric product IDs per order
    // 3. For each order that appears in BOTH files, build seller_sku → numeric_id mapping
    // 4. Query master_products for HPP values
    // 5. Compute estimated_hpp per order = SUM(qty × (hpp + packaging_cost))

    const allOrderNumbers = orders.map((o) => o.order_number)

    // Fetch order_products for matching orders (batched to avoid URL length limits)
    const OP_BATCH = 200
    const opRows: { order_number: string; marketplace_product_id: string }[] = []
    for (let i = 0; i < allOrderNumbers.length; i += OP_BATCH) {
      const chunk = allOrderNumbers.slice(i, i + OP_BATCH)
      const { data } = await serviceClient
        .from('order_products')
        .select('order_number,marketplace_product_id')
        .in('order_number', chunk)
      if (data) opRows.push(...data)
    }

    // Build order_number → [numeric_ids] from income order_products
    const opByOrder = new Map<string, string[]>()
    for (const row of opRows) {
      const arr = opByOrder.get(row.order_number) ?? []
      arr.push(row.marketplace_product_id)
      opByOrder.set(row.order_number, arr)
    }

    // Build seller_sku → numeric_id mapping from single-SKU matched orders (most reliable)
    const sellerSkuToNumericId = new Map<string, string>()
    for (const o of orders) {
      const numericIds = opByOrder.get(o.order_number)
      if (!numericIds || numericIds.length === 0) continue
      const skuProducts = (o.products_json ?? []).filter((p) => p.marketplace_product_id)
      if (skuProducts.length === 0) continue
      if (skuProducts.length === 1 && numericIds.length === 1) {
        sellerSkuToNumericId.set(skuProducts[0].marketplace_product_id!, numericIds[0])
      } else if (skuProducts.length === numericIds.length) {
        // Positional mapping for multi-SKU orders (best-effort)
        for (let i = 0; i < skuProducts.length; i++) {
          const sk = skuProducts[i].marketplace_product_id!
          if (!sellerSkuToNumericId.has(sk)) sellerSkuToNumericId.set(sk, numericIds[i])
        }
      }
    }

    // Collect all numeric IDs we need HPP for
    const numericIdsNeeded = new Set<string>(Array.from(sellerSkuToNumericId.values()))
    // Also try direct seller SKU lookup (future-proof if format changes)
    for (const o of orders) {
      for (const p of o.products_json ?? []) {
        if (p.marketplace_product_id) numericIdsNeeded.add(p.marketplace_product_id)
      }
    }

    // Fetch master_products HPP (scoped to this user + store to respect RLS intent)
    const hppMap = new Map<string, { hpp: number; packaging: number }>()
    if (numericIdsNeeded.size > 0) {
      const idsArr = Array.from(numericIdsNeeded)
      const MP_BATCH = 200
      for (let i = 0; i < idsArr.length; i += MP_BATCH) {
        const chunk = idsArr.slice(i, i + MP_BATCH)
        const { data } = await serviceClient
          .from('master_products')
          .select('marketplace_product_id,hpp,packaging_cost')
          .eq('user_id', user.id)
          .in('marketplace_product_id', chunk)
        if (data) {
          for (const mp of data) {
            hppMap.set(mp.marketplace_product_id, {
              hpp: mp.hpp ?? 0,
              packaging: mp.packaging_cost ?? 0,
            })
          }
        }
      }
    }

    const resolveHpp = (sellerSku: string | null): { hpp: number; packaging: number } | undefined => {
      if (!sellerSku) return undefined
      if (hppMap.has(sellerSku)) return hppMap.get(sellerSku)
      const numericId = sellerSkuToNumericId.get(sellerSku)
      return numericId ? hppMap.get(numericId) : undefined
    }

    // Insert fresh rows in chunks
    const CHUNK = 500
    let insertedCount = 0
    let updatedCount = 0

    const rows = orders.map((o) => {
      // Compute estimated_hpp for this order
      let estimatedHpp = 0
      for (const prod of o.products_json ?? []) {
        const master = resolveHpp(prod.marketplace_product_id)
        if (master && (master.hpp > 0 || master.packaging > 0)) {
          estimatedHpp += (master.hpp + master.packaging) * prod.quantity
        }
      }

      return {
        order_number: o.order_number,
        status_pesanan: o.status_pesanan,
        total_pembayaran: o.total_pembayaran,
        seller_voucher: o.seller_voucher,
        order_date: o.order_date,
        order_complete_date: o.order_complete_date,
        products_json: o.products_json,
        estimated_hpp: estimatedHpp,
        user_id: user.id,
        store_id: storeId,
        upload_batch_id: batch.id,
        marketplace,
      }
    })

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('orders_all').upsert(chunk, {
        onConflict: 'store_id,order_number',
        ignoreDuplicates: false,
      })
      if (error) {
        console.error('orders_all insert error:', error.message)
        warnings.push(`Sebagian data gagal disimpan: ${error.message}`)
      } else {
        for (const row of chunk) {
          if (existingSet.has(row.order_number)) updatedCount++
          else insertedCount++
        }
      }
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: orders.length,
      insertedCount,
      updatedCount,
      unchangedCount: 0,
      duplicateCount: 0,
      newProducts: 0,
      periodStart,
      periodEnd,
      warnings,
    }
    return NextResponse.json(summary)
  } catch (err) {
    console.error('orders-all parse error:', err)
    return NextResponse.json({ error: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
