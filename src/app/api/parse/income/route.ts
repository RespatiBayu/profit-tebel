import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseShopeeIncome } from '@/lib/parsers/shopee-income'
import { cleanupOrphanMasterProducts } from '@/lib/cleanup-orphan-products'
import { classifyIncomingRows } from '@/lib/upload/dedupe'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'
import { userHasStoreAccess } from '@/lib/store-access'
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

    const { orders, orderProducts: opfRows } = parseResult
    // opfRows come from income OPF sheet (numeric Shopee product IDs + product
    // names). We use the product_name to lookup master_products (by name) and
    // populate order_products with whatever ID master_products is keyed by.
    // This is the fallback path for income orders without a matching Order.all.
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

    // Ensure profile row exists as a best-effort safety net.
    const { error: profileError } = await supabase.from('profiles').upsert(
      { id: user.id, email: user.email, is_paid: false },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    if (profileError) {
      console.error('Profile upsert error:', profileError)
    }

    // Resolve/auto-create store
    if (storeId) {
      const hasAccess = await userHasStoreAccess(supabase, user.id, storeId)
      if (!hasAccess) storeId = null
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

    // Enforce workflow: Order.all must be uploaded before Income so we have
    // SKU + qty mapping to compute HPP. Income alone has no per-product info.
    {
      const { count: oaCount } = await supabase
        .from('orders_all')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
      if (!oaCount || oaCount === 0) {
        return NextResponse.json(
          {
            error:
              'Upload file Order.all dulu untuk store ini. Order.all berisi mapping produk per pesanan ' +
              'yang dibutuhkan untuk membuat master produk dan menghitung HPP. Income hanya berisi data finansial.',
          },
          { status: 412 }
        )
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

    // -----------------------------------------------------------------------
    // Populate order_products from income OPF using product_name → master ID
    // resolution. This fills in mappings for income orders that don't have a
    // corresponding Order.all upload (e.g. older months). Strategy:
    //   1. Fetch all user's master_products → build name → marketplace_product_id map
    //   2. For each OPF row, lookup master by normalized product_name
    //   3. Upsert (order_number, master_id, qty=1) — accumulates with Order.all
    //      mappings (qty is meaningful from Order.all; OPF defaults to 1)
    // -----------------------------------------------------------------------
    // OPF diagnostic counters surfaced to upload response so users can see
    // matching health without opening server logs.
    const opfRowsTotal = opfRows.length
    let opfMatchedTotal = 0
    let opfUnmatchedTotal = 0
    const opfUnmatchedSamples: Array<{ id: string | null; name: string | null }> = []
    let opUpsertSuccess = 0

    if (opfRows.length > 0) {
      try {
        const { data: masterRows } = await supabase
          .from('master_products')
          .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
          .eq('store_id', storeId)

        const resolver = new MasterResolver((masterRows ?? []) as MasterRow[])

        // Pass 1: resolve each OPF row → master, collect numeric_id backfills
        // (so master_products learns the SKU↔numeric_id mapping over time).
        const numericIdUpdates = new Map<string, string>() // master.id → numeric_id
        const perOrderAgg = new Map<string, Map<string, { name: string | null; qty: number }>>()
        let opfMatched = 0
        let opfUnmatched = 0

        for (const op of opfRows) {
          const master = resolver.resolve({
            anyId: op.marketplace_product_id, // numeric ID from OPF
            productName: op.product_name,
          })
          if (!master) {
            opfUnmatched++
            if (opfUnmatchedSamples.length < 10) {
              opfUnmatchedSamples.push({
                id: op.marketplace_product_id,
                name: op.product_name,
              })
            }
            continue
          }
          opfMatched++

          // Backfill master.numeric_id if missing and OPF gave us one
          if (!master.numeric_id && op.marketplace_product_id) {
            numericIdUpdates.set(master.id, op.marketplace_product_id)
          }

          // Aggregate by master.marketplace_product_id (canonical) for upsert
          let orderMap = perOrderAgg.get(op.order_number)
          if (!orderMap) {
            orderMap = new Map()
            perOrderAgg.set(op.order_number, orderMap)
          }
          const canonicalId = master.marketplace_product_id
          const existing = orderMap.get(canonicalId)
          if (existing) {
            existing.qty += 1
          } else {
            orderMap.set(canonicalId, { name: master.product_name ?? op.product_name, qty: 1 })
          }
        }

        // Apply numeric_id backfills (one update per master)
        for (const [masterId, numericId] of Array.from(numericIdUpdates.entries())) {
          await supabase
            .from('master_products')
            .update({ numeric_id: numericId })
            .eq('id', masterId)
        }
        if (numericIdUpdates.size > 0) {
          console.log(`Auto-populated numeric_id for ${numericIdUpdates.size} master_products`)
        }

        // Build order_products upsert rows
        const opUpsertRows: Array<{
          user_id: string
          store_id: string
          order_number: string
          marketplace_product_id: string
          product_name: string | null
          quantity: number
        }> = []
        for (const [orderNum, prodMap] of Array.from(perOrderAgg.entries())) {
          for (const [canonicalId, info] of Array.from(prodMap.entries())) {
            opUpsertRows.push({
              user_id: user.id,
              store_id: storeId!,
              order_number: orderNum,
              marketplace_product_id: canonicalId,
              product_name: info.name,
              quantity: info.qty,
            })
          }
        }

        const OP_INSERT_CHUNK = 500
        for (let i = 0; i < opUpsertRows.length; i += OP_INSERT_CHUNK) {
          const chunk = opUpsertRows.slice(i, i + OP_INSERT_CHUNK)
          const { error } = await supabase
            .from('order_products')
            .upsert(chunk, {
              onConflict: 'store_id,order_number,marketplace_product_id',
              ignoreDuplicates: false,
            })
          if (error) {
            console.error('Income OPF order_products upsert error:', error.message)
            warnings.push(`Sebagian mapping produk dari OPF gagal disimpan: ${error.message}`)
          } else {
            opUpsertSuccess += chunk.length
          }
        }
        opfMatchedTotal = opfMatched
        opfUnmatchedTotal = opfUnmatched
        console.log(`Income OPF mapping: ${opfMatched} rows matched, ${opfUnmatched} unmatched`)
        if (opfUnmatched > 0 && opfMatched === 0) {
          warnings.push(
            `${opfUnmatched} baris OPF tidak match dengan master produk. Pastikan master produk sudah diisi (upload Order.all dulu untuk auto-create master).`
          )
        }
      } catch (opfErr) {
        console.error('Income OPF processing error:', opfErr)
      }
    }

    // -----------------------------------------------------------------------
    // Compute estimated_hpp for orders & backfill orders_all using the SKU
    // mapping already populated in `order_products` from Order.all uploads.
    // -----------------------------------------------------------------------
    try {
      const incomeOrderNums = orders.map((o) => o.order_number)
      type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
      const opRows2: OpRow[] = []
      const OP_CHUNK2 = 200
      for (let i = 0; i < incomeOrderNums.length; i += OP_CHUNK2) {
        const chunk = incomeOrderNums.slice(i, i + OP_CHUNK2)
        const { data } = await supabase
          .from('order_products')
          .select('order_number,marketplace_product_id,product_name,quantity')
          .eq('store_id', storeId)
          .in('order_number', chunk)
        if (data) opRows2.push(...(data as OpRow[]))
      }

      // Build order_number → [{id, name, qty}] from order_products
      const orderToProducts = new Map<string, Array<{ id: string; name: string | null; qty: number }>>()
      for (const row of opRows2) {
        const arr = orderToProducts.get(row.order_number) ?? []
        arr.push({ id: row.marketplace_product_id, name: row.product_name, qty: row.quantity ?? 1 })
        orderToProducts.set(row.order_number, arr)
      }

      // Build MasterResolver
      const { data: masterRows2 } = await supabase
        .from('master_products')
        .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
        .eq('store_id', storeId)
      const resolver2 = new MasterResolver((masterRows2 ?? []) as MasterRow[])

      // Compute & update orders.estimated_hpp
      let ordersUpdated = 0
      let ordersWithoutMapping = 0
      for (const order of orders) {
        const items = orderToProducts.get(order.order_number) ?? []
        if (items.length === 0) ordersWithoutMapping++
        let estimatedHpp = 0
        for (const item of items) {
          const master = resolver2.resolve({ anyId: item.id, productName: item.name })
          if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
            estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
          }
        }
        const { error: updErr } = await supabase
          .from('orders')
          .update({ estimated_hpp: estimatedHpp })
          .eq('store_id', storeId)
          .eq('order_number', order.order_number)
        if (!updErr) ordersUpdated++
      }
      console.log(`Income upload: updated estimated_hpp for ${ordersUpdated}/${orders.length} orders (${ordersWithoutMapping} orders had no product mapping)`)
      if (ordersWithoutMapping > 0) {
        warnings.push(
          `${ordersWithoutMapping} dari ${orders.length} order belum punya mapping produk. Pastikan master produk sudah diisi.`
        )
      }

      // Also recalc orders_all.estimated_hpp for matching order_numbers
      const oaRows: { id: string; order_number: string; products_json: unknown }[] = []
      const OA_CHUNK = 200
      for (let i = 0; i < incomeOrderNums.length; i += OA_CHUNK) {
        const { data } = await supabase
          .from('orders_all')
          .select('id,products_json,order_number')
          .eq('store_id', storeId)
          .in('order_number', incomeOrderNums.slice(i, i + OA_CHUNK))
        if (data) oaRows.push(...(data as typeof oaRows))
      }

      if (oaRows.length > 0) {
        type ProdJson = { marketplace_product_id: string | null; product_name?: string | null; quantity: number }
        for (const row of oaRows) {
          const prods = (row.products_json ?? []) as ProdJson[]
          let estimatedHpp = 0
          for (const prod of prods) {
            const master = resolver2.resolve({
              anyId: prod.marketplace_product_id,
              productName: prod.product_name,
            })
            if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
              estimatedHpp += (master.hpp + master.packaging_cost) * prod.quantity
            }
          }
          await supabase
            .from('orders_all')
            .update({ estimated_hpp: estimatedHpp })
            .eq('id', row.id)
        }
        console.log(`Recalculated estimated_hpp for ${oaRows.length} matching orders_all rows`)
      }
    } catch (hppErr) {
      console.error('Income HPP recalc error:', hppErr)
      // Non-fatal
    }

    // NOTE: Auto-create master_products from income OPF data is intentionally
    // REMOVED. Income OPF uses numeric Shopee product IDs which conflict with
    // SKU-keyed master_products. Master products are now created exclusively
    // from Order.all uploads (which carry seller SKU codes that match what
    // user fills in Master Produk).
    const newProducts = 0

    // Update batch with actual inserted count
    await supabase
      .from('upload_batches')
      .update({ record_count: insertedCount + updatedCount })
      .eq('id', batch.id)

    // Cleanup orphan master_products dari upload sebelumnya (ID yang tidak
    // lagi direferensikan setelah data di-refresh).
    const orphanCount = storeId
      ? await cleanupOrphanMasterProducts(supabase, storeId)
      : 0
    if (orphanCount > 0) {
      console.log(`Cleaned up ${orphanCount} orphan master_products`)
      warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
    }

    // Add OPF diagnostic warning if matching was incomplete
    if (opfRowsTotal === 0) {
      warnings.push(
        `⚠️ Sheet "Order Processing Fee" di file income kosong / tidak ditemukan. HPP tidak bisa dihitung tanpa data OPF. Pastikan kamu download file dari Keuangan → Penghasilan Saya (bukan Income Summary saja).`
      )
    } else if (opfUnmatchedTotal > 0) {
      const pct = Math.round((opfUnmatchedTotal / opfRowsTotal) * 100)
      warnings.push(
        `OPF: ${opfMatchedTotal}/${opfRowsTotal} baris match master (${pct}% gagal match). Sample produk gagal match: ${opfUnmatchedSamples
          .slice(0, 3)
          .map((s) => s.name ?? s.id ?? '?')
          .join(' · ')}. Upload Order.all dulu supaya master produk lengkap.`
      )
    }

    const summary: UploadSummary & {
      opfRowsTotal?: number
      opfMatched?: number
      opfUnmatched?: number
      orderProductsCreated?: number
      opfUnmatchedSamples?: Array<{ id: string | null; name: string | null }>
    } = {
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
      opfRowsTotal,
      opfMatched: opfMatchedTotal,
      opfUnmatched: opfUnmatchedTotal,
      orderProductsCreated: opUpsertSuccess,
      opfUnmatchedSamples,
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
