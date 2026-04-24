import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseShopeeIncome } from '@/lib/parsers/shopee-income'
import { cleanupOrphanMasterProducts } from '@/lib/cleanup-orphan-products'
import { classifyIncomingRows } from '@/lib/upload/dedupe'
import type { UploadSummary } from '@/types'

// Financial fields yang mungkin direvisi Shopee antar export (settlement update,
// koreksi admin fee, dll) — dibandingkan untuk detect perubahan.
const ORDER_COMPARE_FIELDS = [
  'release_date',
  'payment_method',
  'original_price',
  'product_discount',
  'refund_amount',
  'seller_voucher',
  'seller_voucher_cofund',
  'seller_cashback',
  'buyer_shipping_fee',
  'shopee_shipping_subsidy',
  'actual_shipping_cost',
  'return_shipping_cost',
  'ams_commission',
  'admin_fee',
  'service_fee',
  'processing_fee',
  'premium_fee',
  'shipping_program_fee',
  'transaction_fee',
  'campaign_fee',
  'total_income',
  'seller_free_shipping_promo',
] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const marketplace = (formData.get('marketplace') as string) ?? 'shopee'
    let storeId = (formData.get('storeId') as string | null) ?? null

    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 })
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'File harus berformat .xlsx atau .xls' },
        { status: 400 }
      )
    }

    // Parse the file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let parseResult
    try {
      parseResult = parseShopeeIncome(buffer)
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : 'Format file tidak valid'
      return NextResponse.json({ error: msg }, { status: 422 })
    }

    const { orders, orderProducts } = parseResult
    // Validate dates — only pass valid ISO to DB, else null
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    const periodStart = parseResult.periodStart && isoDate.test(parseResult.periodStart)
      ? parseResult.periodStart
      : null
    const periodEnd = parseResult.periodEnd && isoDate.test(parseResult.periodEnd)
      ? parseResult.periodEnd
      : null
    // Also sanitize per-order dates
    for (const o of orders) {
      if (o.order_date && !isoDate.test(o.order_date)) o.order_date = null
      if (o.release_date && !isoDate.test(o.release_date)) o.release_date = null
    }

    if (orders.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data order ditemukan dalam file. Pastikan file income Shopee yang kamu upload.' },
        { status: 422 }
      )
    }

    // Ensure profile row exists (safety net — use service client to bypass RLS)
    const serviceClient = await createServiceClient()
    const { error: profileError } = await serviceClient.from('profiles').upsert(
      { id: user.id, email: user.email, is_paid: false },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    if (profileError) {
      console.error('Profile upsert error:', profileError)
    }

    // Resolve/auto-create store
    if (storeId) {
      const { data: storeRow } = await supabase
        .from('stores')
        .select('id')
        .eq('id', storeId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!storeRow) storeId = null
    }
    if (!storeId) {
      const { data: defaultStore } = await supabase
        .from('stores')
        .select('id')
        .eq('user_id', user.id)
        .eq('marketplace', marketplace)
        .eq('name', 'Toko Utama')
        .maybeSingle()
      if (defaultStore) {
        storeId = defaultStore.id
      } else {
        const { data: newStore, error: storeErr } = await supabase
          .from('stores')
          .insert({ user_id: user.id, name: 'Toko Utama', marketplace })
          .select('id')
          .single()
        if (storeErr || !newStore) {
          console.error('Store create error:', storeErr)
          return NextResponse.json(
            { error: `Gagal membuat store default: ${storeErr?.message ?? 'unknown'}` },
            { status: 500 }
          )
        }
        storeId = newStore.id
      }
    }

    // Create upload batch
    const { data: batch, error: batchError } = await supabase
      .from('upload_batches')
      .insert({
        user_id: user.id,
        store_id: storeId,
        file_name: file.name,
        file_type: 'income',
        marketplace,
        record_count: orders.length,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select('id')
      .single()

    if (batchError || !batch) {
      console.error('Batch insert error:', batchError)
      return NextResponse.json(
        { error: `Gagal menyimpan batch upload: ${batchError?.message ?? 'unknown error'}` },
        { status: 500 }
      )
    }

    // Dedup: fetch existing orders with their financial fields, classify incoming
    // → insert (baru), update (values berubah = Shopee revisi settlement), skip (identik).
    const incomingOrderNumbers = orders.map((o) => o.order_number)
    const existingMap = new Map<string, Record<string, unknown>>()

    // Query in chunks (Supabase .in() has a limit around 1000)
    const QUERY_CHUNK = 500
    const selectCols = ['order_number', ...ORDER_COMPARE_FIELDS].join(', ')
    for (let i = 0; i < incomingOrderNumbers.length; i += QUERY_CHUNK) {
      const slice = incomingOrderNumbers.slice(i, i + QUERY_CHUNK)
      const { data: existingOrders } = await supabase
        .from('orders')
        .select(selectCols)
        .eq('store_id', storeId)
        .in('order_number', slice)
      if (existingOrders) {
        for (const row of existingOrders as unknown as Array<Record<string, unknown>>) {
          existingMap.set(row.order_number as string, row)
        }
      }
    }

    const { toInsert, toUpdate, unchangedCount } = classifyIncomingRows(
      orders as unknown as Record<string, unknown>[],
      existingMap,
      (o) => (o as unknown as { order_number: string }).order_number,
      ORDER_COMPARE_FIELDS as unknown as readonly string[],
    )

    const CHUNK = 500
    const toInsertRows = (toInsert as unknown as typeof orders).map((o) => ({
      ...o,
      user_id: user.id,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace,
    }))
    const toUpdateRows = (toUpdate as unknown as typeof orders).map((o) => ({
      ...o,
      user_id: user.id,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace,
    }))

    let insertedCount = 0
    let updatedCount = 0
    const warnings: string[] = []

    // Insert rows baru — pakai upsert + ignoreDuplicates sebagai safety net
    // jikalau row muncul di race condition.
    for (let i = 0; i < toInsertRows.length; i += CHUNK) {
      const chunk = toInsertRows.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('orders')
        .upsert(chunk, {
          onConflict: 'store_id,order_number',
          ignoreDuplicates: true,
        })
      if (error) {
        console.error('Order insert error:', error.message)
        warnings.push(`Sebagian order gagal disimpan: ${error.message}`)
      } else {
        insertedCount += chunk.length
      }
    }

    // Overwrite rows yang berubah — upsert dengan ignoreDuplicates: false akan
    // meng-update kolom-kolom baru kalau key (store_id, order_number) sudah ada.
    for (let i = 0; i < toUpdateRows.length; i += CHUNK) {
      const chunk = toUpdateRows.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('orders')
        .upsert(chunk, {
          onConflict: 'store_id,order_number',
          ignoreDuplicates: false,
        })
      if (error) {
        console.error('Order update error:', error.message)
        warnings.push(`Sebagian order gagal di-update: ${error.message}`)
      } else {
        updatedCount += chunk.length
      }
    }

    const duplicateCount = unchangedCount

    // Insert order_products — always upsert ALL parsed product rows (not just for new orders).
    // This allows re-upload to backfill missing mappings for already-existing orders.
    // The unique constraint (store_id, order_number, marketplace_product_id) + ignoreDuplicates
    // ensures we never create dupes while still backfilling gaps.
    if (orderProducts.length > 0) {
      const opRowsAll = orderProducts.map((op) => ({
        ...op,
        user_id: user.id,
        store_id: storeId,
      }))
      let opInserted = 0
      for (let i = 0; i < opRowsAll.length; i += CHUNK) {
        const { error } = await supabase
          .from('order_products')
          .upsert(opRowsAll.slice(i, i + CHUNK), {
            onConflict: 'store_id,order_number,marketplace_product_id',
            ignoreDuplicates: true,
          })
        if (error) {
          console.error('Order products insert error:', error.message)
          warnings.push(`Sebagian mapping produk gagal: ${error.message}`)
        } else {
          opInserted += Math.min(CHUNK, opRowsAll.length - i)
        }
      }
      console.log(`Upserted ${opInserted}/${opRowsAll.length} order_products rows`)
    }

    // Auto-create master_products for new products
    const uniqueProducts = new Map<string, { name: string }>()
    for (const op of orderProducts) {
      if (!uniqueProducts.has(op.marketplace_product_id)) {
        uniqueProducts.set(op.marketplace_product_id, {
          name: op.product_name ?? `Produk ${op.marketplace_product_id}`,
        })
      }
    }

    // Update batch with actual inserted count
    await supabase
      .from('upload_batches')
      .update({ record_count: insertedCount + updatedCount })
      .eq('id', batch.id)

    let newProducts = 0
    for (const [productId, { name }] of Array.from(uniqueProducts)) {
      const { data: existing } = await supabase
        .from('master_products')
        .select('id')
        .eq('store_id', storeId)
        .eq('marketplace_product_id', productId)
        .maybeSingle()

      if (!existing) {
        const { error } = await supabase.from('master_products').insert({
          user_id: user.id,
          store_id: storeId,
          marketplace_product_id: productId,
          product_name: name,
          marketplace,
          hpp: 0,
          packaging_cost: 0,
        })
        if (!error) newProducts++
      }
    }

    // Cleanup orphan master_products dari upload sebelumnya (ID yang tidak
    // lagi direferensikan setelah data di-refresh).
    const orphanCount = storeId
      ? await cleanupOrphanMasterProducts(supabase, storeId)
      : 0
    if (orphanCount > 0) {
      console.log(`Cleaned up ${orphanCount} orphan master_products`)
      warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: orders.length,
      insertedCount,
      updatedCount,
      unchangedCount,
      duplicateCount,
      newProducts,
      periodStart,
      periodEnd,
      warnings,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Income parse error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server. Coba lagi.' },
      { status: 500 }
    )
  }
}
