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
    let storeId = (formData.get('storeId') as string | null) ?? null

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

    const { rows: rawRows, shopAggregate } = parseResult
    // Validate dates — only pass valid ISO to DB, else null
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    const periodStart = parseResult.periodStart && isoDate.test(parseResult.periodStart)
      ? parseResult.periodStart
      : null
    const periodEnd = parseResult.periodEnd && isoDate.test(parseResult.periodEnd)
      ? parseResult.periodEnd
      : null

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data iklan ditemukan dalam file. Pastikan file CSV iklan Shopee yang kamu upload.' },
        { status: 422 }
      )
    }

    // Aggregate multiple campaigns for the same product_code into one row.
    // A single product can appear in multiple campaigns (e.g. GMV Max ROAS + GMV Max Auto)
    // with the same report period. Sum all numeric metrics and recompute derived ones.
    const aggMap = new Map<string, typeof rawRows[0]>()
    for (const row of rawRows) {
      const existing = aggMap.get(row.product_code)
      if (!existing) {
        aggMap.set(row.product_code, { ...row })
      } else {
        existing.impressions += row.impressions
        existing.clicks += row.clicks
        existing.conversions += row.conversions
        existing.direct_conversions += row.direct_conversions
        existing.units_sold += row.units_sold
        existing.direct_units_sold += row.direct_units_sold
        existing.gmv += row.gmv
        existing.direct_gmv += row.direct_gmv
        existing.ad_spend += row.ad_spend
        existing.voucher_amount += row.voucher_amount
        existing.vouchered_sales += row.vouchered_sales
        // Recompute derived metrics from the new sums
        existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions : 0
        existing.roas = existing.ad_spend > 0 ? existing.gmv / existing.ad_spend : 0
        existing.direct_roas = existing.ad_spend > 0 ? existing.direct_gmv / existing.ad_spend : 0
        existing.conversion_rate = existing.clicks > 0 ? existing.conversions / existing.clicks : 0
        existing.direct_conversion_rate = existing.clicks > 0 ? existing.direct_conversions / existing.clicks : 0
        existing.cost_per_conversion = existing.conversions > 0 ? existing.ad_spend / existing.conversions : 0
        existing.cost_per_direct_conversion = existing.direct_conversions > 0 ? existing.ad_spend / existing.direct_conversions : 0
        existing.acos = existing.gmv > 0 ? existing.ad_spend / existing.gmv : 0
        existing.direct_acos = existing.direct_gmv > 0 ? existing.ad_spend / existing.direct_gmv : 0
      }
    }
    const rows = Array.from(aggMap.values())

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
      store_id: storeId,
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
        store_id: storeId,
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

    // Dedup: check which (product_code, period) already exist for this user+marketplace
    const adsKeys = adsRows.map((r) => ({
      product_code: r.product_code,
      period_start: r.report_period_start,
      period_end: r.report_period_end,
    }))
    const existingSet = new Set<string>()
    const QUERY_CHUNK = 500
    const uniqueCodes = Array.from(new Set(adsKeys.map((k) => k.product_code)))
    for (let i = 0; i < uniqueCodes.length; i += QUERY_CHUNK) {
      const slice = uniqueCodes.slice(i, i + QUERY_CHUNK)
      const { data: existingAds } = await supabase
        .from('ads_data')
        .select('product_code, report_period_start, report_period_end')
        .eq('store_id', storeId)
        .in('product_code', slice)
      if (existingAds) {
        for (const row of existingAds) {
          existingSet.add(
            `${row.product_code}|${row.report_period_start}|${row.report_period_end}`
          )
        }
      }
    }

    const newAdsRows = adsRows.filter(
      (r) =>
        !existingSet.has(
          `${r.product_code}|${r.report_period_start}|${r.report_period_end}`
        )
    )
    const duplicateCount = adsRows.length - newAdsRows.length

    const CHUNK = 500
    let insertedCount = 0
    const warnings: string[] = []
    for (let i = 0; i < newAdsRows.length; i += CHUNK) {
      const chunk = newAdsRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('ads_data').upsert(chunk, {
        onConflict:
          'store_id,product_code,report_period_start,report_period_end',
        ignoreDuplicates: true,
      })
      if (error) {
        console.error('Ads insert error:', error.message)
        warnings.push(`Sebagian data iklan gagal disimpan: ${error.message}`)
      } else {
        insertedCount += chunk.length
      }
    }

    // Update batch with actual inserted count
    await supabase
      .from('upload_batches')
      .update({ record_count: insertedCount })
      .eq('id', batch.id)

    // Auto-create master_products for new products found in ads
    let newProducts = 0
    for (const row of rows) {
      if (!row.product_code || row.product_code === '-') continue

      const { data: existing } = await supabase
        .from('master_products')
        .select('id')
        .eq('store_id', storeId)
        .eq('marketplace_product_id', row.product_code)
        .maybeSingle()

      if (!existing) {
        const { error } = await supabase.from('master_products').insert({
          user_id: user.id,
          store_id: storeId,
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
      insertedCount,
      duplicateCount,
      newProducts,
      periodStart,
      periodEnd,
      warnings,
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
