import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseShopeeAds } from '@/lib/parsers/shopee-ads'
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
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File harus berformat .csv' },
        { status: 400 }
      )
    }

    // Parse the file
    const text = await file.text()

    let parseResult
    try {
      parseResult = parseShopeeAds(text)
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : 'Format file tidak valid'
      return NextResponse.json({ error: msg }, { status: 422 })
    }

    const { rows, shopAggregate, periodStart, periodEnd } = parseResult

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data iklan ditemukan dalam file. Pastikan file CSV iklan Shopee yang kamu upload.' },
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

    // Create upload batch
    const { data: batch, error: batchError } = await supabase
      .from('upload_batches')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_type: 'ads',
        marketplace,
        record_count: rows.length,
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

    // Prepare ads rows for insert
    const adsRows = rows.map((r) => ({
      user_id: user.id,
      upload_batch_id: batch.id,
      marketplace,
      product_name: r.product_name,
      product_code: r.product_code,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      conversions: r.conversions,
      direct_conversions: r.direct_conversions,
      conversion_rate: r.conversion_rate,
      direct_conversion_rate: r.direct_conversion_rate,
      cost_per_conversion: r.cost_per_conversion,
      cost_per_direct_conversion: r.cost_per_direct_conversion,
      units_sold: r.units_sold,
      direct_units_sold: r.direct_units_sold,
      gmv: r.gmv,
      direct_gmv: r.direct_gmv,
      ad_spend: r.ad_spend,
      roas: r.roas,
      direct_roas: r.direct_roas,
      acos: r.acos,
      direct_acos: r.direct_acos,
      voucher_amount: r.voucher_amount,
      vouchered_sales: r.vouchered_sales,
      report_period_start: periodStart,
      report_period_end: periodEnd,
    }))

    // Also insert shop aggregate if present
    if (shopAggregate) {
      adsRows.push({
        user_id: user.id,
        upload_batch_id: batch.id,
        marketplace,
        product_name: 'Shop GMV Max (Agregat)',
        product_code: '-',
        impressions: shopAggregate.impressions,
        clicks: shopAggregate.clicks,
        ctr: shopAggregate.ctr,
        conversions: shopAggregate.conversions,
        direct_conversions: shopAggregate.direct_conversions,
        conversion_rate: shopAggregate.conversion_rate,
        direct_conversion_rate: shopAggregate.direct_conversion_rate,
        cost_per_conversion: shopAggregate.cost_per_conversion,
        cost_per_direct_conversion: shopAggregate.cost_per_direct_conversion,
        units_sold: shopAggregate.units_sold,
        direct_units_sold: shopAggregate.direct_units_sold,
        gmv: shopAggregate.gmv,
        direct_gmv: shopAggregate.direct_gmv,
        ad_spend: shopAggregate.ad_spend,
        roas: shopAggregate.roas,
        direct_roas: shopAggregate.direct_roas,
        acos: shopAggregate.acos,
        direct_acos: shopAggregate.direct_acos,
        voucher_amount: shopAggregate.voucher_amount,
        vouchered_sales: shopAggregate.vouchered_sales,
        report_period_start: periodStart,
        report_period_end: periodEnd,
      })
    }

    const CHUNK = 500
    for (let i = 0; i < adsRows.length; i += CHUNK) {
      await supabase.from('ads_data').insert(adsRows.slice(i, i + CHUNK))
    }

    // Auto-create master_products for new products found in ads
    let newProducts = 0
    for (const row of rows) {
      if (!row.product_code || row.product_code === '-') continue

      const { data: existing } = await supabase
        .from('master_products')
        .select('id')
        .eq('user_id', user.id)
        .eq('marketplace_product_id', row.product_code)
        .eq('marketplace', marketplace)
        .single()

      if (!existing) {
        const { error } = await supabase.from('master_products').insert({
          user_id: user.id,
          marketplace_product_id: row.product_code,
          product_name: row.product_name ?? `Produk ${row.product_code}`,
          marketplace,
          hpp: 0,
          packaging_cost: 0,
        })
        if (!error) newProducts++
      }
    }

    const summary: UploadSummary = {
      batchId: batch.id,
      recordCount: rows.length,
      newProducts,
      periodStart,
      periodEnd,
      warnings: [],
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Ads parse error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server. Coba lagi.' },
      { status: 500 }
    )
  }
}
