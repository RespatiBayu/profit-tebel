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

    // Wipe-and-replace by period overlap (take latest version as source of truth)
    const warnings: string[] = []
    if (periodStart && periodEnd) {
      const { error: delErr } = await supabase.from('orders_all').delete()
        .eq('store_id', storeId)
        .lte('order_date', periodEnd)
        .gte('order_date', periodStart)
      if (delErr) warnings.push(`Gagal menghapus data lama: ${delErr.message}`)
    }

    // Insert
    const CHUNK = 500
    let insertedCount = 0
    const rows = orders.map((o) => ({
      order_number: o.order_number,
      status_pesanan: o.status_pesanan,
      total_pembayaran: o.total_pembayaran,
      seller_voucher: o.seller_voucher,
      order_date: o.order_date,
      order_complete_date: o.order_complete_date,
      products_json: o.products_json,
      user_id: user.id,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace,
    }))

    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('orders_all').upsert(rows.slice(i, i + CHUNK), {
        onConflict: 'store_id,order_number',
        ignoreDuplicates: false,
      })
      if (error) {
        console.error('orders_all insert error:', error.message)
        warnings.push(`Sebagian data gagal disimpan: ${error.message}`)
      } else {
        insertedCount += Math.min(CHUNK, rows.length - i)
      }
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: orders.length,
      insertedCount,
      updatedCount: 0,
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
