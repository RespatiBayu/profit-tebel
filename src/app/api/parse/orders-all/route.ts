import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseShopeeOrdersAll } from '@/lib/parsers/shopee-orders-all'
import { MasterResolver, normalizeName, type MasterRow as ResolverMasterRow } from '@/lib/master-resolver'
import { userHasStoreAccess } from '@/lib/store-access'
import type { UploadSummary } from '@/types'

// ---------------------------------------------------------------------------
// Order.all upload — primary source of order → SKU mapping.
//
// Why Order.all is the backbone:
// - Has per-row SKU (Nomor Referensi SKU) + Jumlah (quantity)
// - Covers ALL orders in the period (pending + completed before settlement)
// - Same SKU codes are what user sets HPP against in Master Produk
//
// On upload, we:
//   1. Wipe-and-replace orders_all in date range (status changes possible)
//   2. UPSERT order_products with SKU + qty (accumulate, never wipe — once an
//      order has a product mapping it stays even after settlement moves it
//      from Order.all to Income)
//   3. Auto-migrate master_products: rename numeric Shopee IDs → seller SKU
//      when product_name matches (preserves any HPP user already filled in)
//   4. Auto-create master_products for new SKUs (HPP=0)
//   5. Compute estimated_hpp for orders_all (pending) using SKU lookup
//   6. Backfill orders.estimated_hpp (income) for matching order_numbers
// ---------------------------------------------------------------------------
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

    // Ensure profile row exists as a best-effort safety net.
    await supabase.from('profiles').upsert(
      { id: user.id, email: user.email, is_paid: false },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    // Resolve store
    if (storeId) {
      const hasAccess = await userHasStoreAccess(supabase, user.id, storeId)
      if (!hasAccess) storeId = null
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

    // Existing order_numbers (for inserted vs updated count)
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

    // -----------------------------------------------------------------------
    // Wipe-and-replace orders_all for the period (handles cancellations &
    // status changes — old rows must be cleared before fresh insert).
    // -----------------------------------------------------------------------
    if (periodStart && periodEnd) {
      const { error: delErr } = await supabase
        .from('orders_all')
        .delete()
        .eq('store_id', storeId!)
        .lte('order_date', periodEnd)
        .gte('order_date', periodStart)
      if (delErr) warnings.push(`Gagal menghapus data lama: ${delErr.message}`)
    } else {
      const { error: delErr } = await supabase
        .from('orders_all')
        .delete()
        .eq('store_id', storeId!)
      if (delErr) warnings.push(`Gagal menghapus data lama: ${delErr.message}`)
    }

    // =======================================================================
    // STEP A: UPSERT order_products with SKU + qty from Order.all rows.
    // We accumulate (don't wipe) — once an order has a SKU mapping it should
    // persist even after the order settles and disappears from Order.all.
    // =======================================================================
    type OpUpsertRow = {
      user_id: string
      store_id: string
      order_number: string
      marketplace_product_id: string
      product_name: string | null
      quantity: number
    }
    const opUpsertRows: OpUpsertRow[] = []
    for (const o of orders) {
      // Aggregate same SKU within an order (Order.all may already split per SKU,
      // but defensive: if same SKU appears twice, sum the qty)
      const perOrderAgg = new Map<string, { name: string | null; qty: number }>()
      for (const prod of o.products_json ?? []) {
        if (!prod.marketplace_product_id) continue
        const existing = perOrderAgg.get(prod.marketplace_product_id)
        if (existing) {
          existing.qty += prod.quantity
        } else {
          perOrderAgg.set(prod.marketplace_product_id, {
            name: prod.product_name,
            qty: prod.quantity,
          })
        }
      }
      for (const [sku, info] of Array.from(perOrderAgg.entries())) {
        opUpsertRows.push({
          user_id: user.id,
          store_id: storeId!,
          order_number: o.order_number,
          marketplace_product_id: sku,
          product_name: info.name,
          quantity: info.qty,
        })
      }
    }

    const OP_CHUNK = 500
    let opInserted = 0
    for (let i = 0; i < opUpsertRows.length; i += OP_CHUNK) {
      const chunk = opUpsertRows.slice(i, i + OP_CHUNK)
      const { error } = await supabase
        .from('order_products')
        .upsert(chunk, {
          onConflict: 'store_id,order_number,marketplace_product_id',
          ignoreDuplicates: false,  // overwrite to update qty if changed
        })
      if (error) {
        console.error('order_products upsert error:', error.message)
        warnings.push(`Sebagian mapping produk gagal disimpan: ${error.message}`)
      } else {
        opInserted += chunk.length
      }
    }
    console.log(`Upserted ${opInserted}/${opUpsertRows.length} order_products rows from Order.all`)

    // =======================================================================
    // STEP B: Auto-migrate master_products from numeric Shopee IDs → SKU IDs
    // by matching product_name. This preserves HPP user already filled in.
    // =======================================================================
    const skuToName = new Map<string, string>()
    for (const o of orders) {
      for (const prod of o.products_json ?? []) {
        if (prod.marketplace_product_id && prod.product_name && !skuToName.has(prod.marketplace_product_id)) {
          skuToName.set(prod.marketplace_product_id, prod.product_name)
        }
      }
    }

    let migratedCount = 0
    let createdCount = 0
    if (skuToName.size > 0) {
      const { data: existingMasters } = await supabase
        .from('master_products')
        .select('id,marketplace_product_id,product_name,hpp,packaging_cost,store_id')
        .eq('store_id', storeId)

      type MasterRow = { id: string; marketplace_product_id: string; product_name: string | null; hpp: number; packaging_cost: number; store_id: string | null }
      const existingByName = new Map<string, MasterRow>()
      const existingBySku = new Set<string>()
      for (const mp of (existingMasters ?? []) as MasterRow[]) {
        if (mp.product_name) {
          const normName = normalizeName(mp.product_name)
          // Prefer existing SKU-keyed entries over numeric ones, in case of dupes
          const prev = existingByName.get(normName)
          if (!prev || /^\d+$/.test(prev.marketplace_product_id)) {
            existingByName.set(normName, mp)
          }
        }
        existingBySku.add(mp.marketplace_product_id)
      }

      for (const [sku, name] of Array.from(skuToName.entries())) {
        if (existingBySku.has(sku)) continue  // already SKU-keyed, nothing to do

        const normName = normalizeName(name)
        const matched = existingByName.get(normName)
        const isMatchedNumeric = matched && /^\d+$/.test(matched.marketplace_product_id)

        if (matched && isMatchedNumeric) {
          // Rename numeric ID → SKU. Preserve old numeric ID by writing it into
          // master.numeric_id column so future income OPF rows can still resolve.
          const { error: renameErr } = await supabase
            .from('master_products')
            .update({
              marketplace_product_id: sku,
              numeric_id: matched.marketplace_product_id,
            })
            .eq('id', matched.id)
          if (renameErr) {
            console.error(`Failed to migrate master "${name}" (${matched.marketplace_product_id} → ${sku}):`, renameErr.message)
          } else {
            console.log(`Migrated master "${name}": ${matched.marketplace_product_id} → ${sku} (HPP=${matched.hpp})`)
            existingBySku.add(sku)
            existingByName.delete(normName)
            migratedCount++
          }
        } else if (!matched) {
          // No match by name — create new SKU-keyed master
          const { error: createErr } = await supabase
            .from('master_products')
            .insert({
              user_id: user.id,
              store_id: storeId,
              marketplace_product_id: sku,
              product_name: name,
              marketplace,
              hpp: 0,
              packaging_cost: 0,
            })
          if (createErr) {
            console.error(`Failed to create master "${name}" (${sku}):`, createErr.message)
          } else {
            existingBySku.add(sku)
            createdCount++
          }
        }
        // else: matched but already SKU-keyed (different SKU) → skip
      }
    }
    if (migratedCount > 0) console.log(`Migrated ${migratedCount} master_products from numeric ID → SKU`)
    if (createdCount > 0) console.log(`Auto-created ${createdCount} new master_products (HPP=0)`)

    // =======================================================================
    // STEP C: Build MasterResolver for this user (after migration so renames apply)
    // =======================================================================
    const { data: allMasters } = await supabase
      .from('master_products')
      .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
      .eq('store_id', storeId)
    const resolver = new MasterResolver((allMasters ?? []) as ResolverMasterRow[])

    // =======================================================================
    // STEP D: Compute estimated_hpp per orders_all row (via resolver:
    //   matches by SKU, numeric_id, or product_name fallback)
    // =======================================================================
    const rows = orders.map((o) => {
      let estimatedHpp = 0
      for (const prod of o.products_json ?? []) {
        const master = resolver.resolve({
          anyId: prod.marketplace_product_id,
          productName: prod.product_name,
        })
        if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
          estimatedHpp += (master.hpp + master.packaging_cost) * prod.quantity
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

    // =======================================================================
    // STEP E: Insert orders_all
    // =======================================================================
    const CHUNK = 500
    let insertedCount = 0
    let updatedCount = 0
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

    // =======================================================================
    // STEP F: Backfill orders.estimated_hpp for matching income orders.
    // After Order.all upload, any income order with the same order_number
    // now has order_products entries (SKU + qty), so we can compute its HPP.
    // =======================================================================
    try {
      const incomeOrderNums = orders.map((o) => o.order_number)
      const orderToProducts = new Map<string, Array<{ id: string; name: string | null; qty: number }>>()

      // Build directly from what we just upserted
      for (const op of opUpsertRows) {
        const arr = orderToProducts.get(op.order_number) ?? []
        arr.push({ id: op.marketplace_product_id, name: op.product_name, qty: op.quantity })
        orderToProducts.set(op.order_number, arr)
      }

      let backfilledCount = 0
      const UPD_CHUNK = 100
      for (let i = 0; i < incomeOrderNums.length; i += UPD_CHUNK) {
        const chunk = incomeOrderNums.slice(i, i + UPD_CHUNK)
        for (const orderNum of chunk) {
          const items = orderToProducts.get(orderNum) ?? []
          let estimatedHpp = 0
          for (const item of items) {
            const master = resolver.resolve({ anyId: item.id, productName: item.name })
            if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
              estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
            }
          }
          const { error: updErr } = await supabase
            .from('orders')
            .update({ estimated_hpp: estimatedHpp })
            .eq('store_id', storeId!)
            .eq('order_number', orderNum)
          if (!updErr) backfilledCount++
        }
      }
      console.log(`Backfilled estimated_hpp for ${backfilledCount} income orders`)
    } catch (backfillErr) {
      console.error('Income orders estimated_hpp backfill error:', backfillErr)
      // Non-fatal
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: orders.length,
      insertedCount,
      updatedCount,
      unchangedCount: 0,
      duplicateCount: 0,
      newProducts: createdCount,
      periodStart,
      periodEnd,
      warnings: [
        ...warnings,
        ...(migratedCount > 0 ? [`${migratedCount} master produk dimigrasi dari ID Shopee → SKU (HPP terpelihara)`] : []),
        ...(createdCount > 0 ? [`${createdCount} master produk baru dibuat (HPP=0, perlu diisi)`] : []),
      ],
    }
    return NextResponse.json(summary)
  } catch (err) {
    console.error('orders-all parse error:', err)
    return NextResponse.json({ error: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
