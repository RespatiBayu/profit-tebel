import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseShopeeIncome } from '@/lib/parsers/shopee-income'
import type { UploadSummary } from '@/types'

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

    const { orders, orderProducts, periodStart, periodEnd } = parseResult

    if (orders.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data order ditemukan dalam file. Pastikan file income Shopee yang kamu upload.' },
        { status: 422 }
      )
    }

    // Create upload batch
    const { data: batch, error: batchError } = await supabase
      .from('upload_batches')
      .insert({
        user_id: user.id,
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
      return NextResponse.json({ error: 'Gagal menyimpan batch upload' }, { status: 500 })
    }

    // Insert orders in chunks of 500
    const CHUNK = 500
    const orderRows = orders.map((o) => ({
      ...o,
      user_id: user.id,
      upload_batch_id: batch.id,
      marketplace,
    }))

    for (let i = 0; i < orderRows.length; i += CHUNK) {
      const { error } = await supabase
        .from('orders')
        .upsert(orderRows.slice(i, i + CHUNK), {
          onConflict: 'upload_batch_id,order_number',
          ignoreDuplicates: false,
        })
      if (error) {
        // Non-fatal: continue but track warning
        console.error('Order insert error:', error.message)
      }
    }

    // Insert order_products
    if (orderProducts.length > 0) {
      const opRows = orderProducts.map((op) => ({
        ...op,
        user_id: user.id,
      }))
      for (let i = 0; i < opRows.length; i += CHUNK) {
        await supabase.from('order_products').insert(opRows.slice(i, i + CHUNK))
      }
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

    let newProducts = 0
    for (const [productId, { name }] of Array.from(uniqueProducts)) {
      const { data: existing } = await supabase
        .from('master_products')
        .select('id')
        .eq('user_id', user.id)
        .eq('marketplace_product_id', productId)
        .eq('marketplace', marketplace)
        .single()

      if (!existing) {
        const { error } = await supabase.from('master_products').insert({
          user_id: user.id,
          marketplace_product_id: productId,
          product_name: name,
          marketplace,
          hpp: 0,
          packaging_cost: 0,
        })
        if (!error) newProducts++
      }
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: orders.length,
      newProducts,
      periodStart,
      periodEnd,
      warnings: [],
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
