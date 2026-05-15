import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupOrphanMasterProducts } from '@/lib/cleanup-orphan-products'
import { MasterResolver, normalizeName, type MasterRow as ResolverMasterRow } from '@/lib/master-resolver'
import { parseShopeeAds } from '@/lib/parsers/shopee-ads'
import { parseShopeeAdsProduct } from '@/lib/parsers/shopee-ads-product'
import { parseShopeeIncome } from '@/lib/parsers/shopee-income'
import { parseShopeeOrdersAll } from '@/lib/parsers/shopee-orders-all'
import { classifyIncomingRows } from '@/lib/upload/dedupe'
import type { UploadFileType, UploadJobResult } from '@/types'
import { ensureProfileRow, resolveUploadStore } from './shared'

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

type ProgressReporter = (progress: number, label: string) => Promise<void> | void

export interface UploadProcessorContext {
  supabase: SupabaseClient
  userId: string
  userEmail: string | null
  marketplace: string
  requestedStoreId: string | null
  fileName: string
  buffer: Buffer
  reportProgress?: ProgressReporter
}

async function setProgress(ctx: UploadProcessorContext, progress: number, label: string) {
  await ctx.reportProgress?.(progress, label)
}

function ensureValidDate(value: string | null | undefined) {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  return value && isoDate.test(value) ? value : null
}

export async function processUploadJobByType(
  type: UploadFileType,
  ctx: UploadProcessorContext
): Promise<UploadJobResult> {
  if (type === 'income') return processIncomeUpload(ctx)
  if (type === 'ads') return processAdsUpload(ctx)
  if (type === 'ads_product') return processAdsProductUpload(ctx)
  return processOrdersAllUpload(ctx)
}

export async function processAdsUpload(ctx: UploadProcessorContext): Promise<UploadJobResult> {
  await setProgress(ctx, 10, 'Membaca file iklan')

  const text = ctx.buffer.toString('utf8')
  const parseResult = parseShopeeAds(text)
  const { rows: rawRows, shopAggregate } = parseResult
  const periodStart = ensureValidDate(parseResult.periodStart)
  const periodEnd = ensureValidDate(parseResult.periodEnd)

  if (rawRows.length === 0) {
    throw new Error('Tidak ada data iklan ditemukan dalam file. Pastikan file CSV iklan Shopee yang kamu upload.')
  }

  const aggMap = new Map<string, typeof rawRows[0]>()
  for (const row of rawRows) {
    const key = row.ad_name ?? row.product_code
    const existing = aggMap.get(key)
    if (!existing) {
      aggMap.set(key, { ...row })
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

  for (const row of rows) {
    row.roas = row.ad_spend > 0 ? row.gmv / row.ad_spend : 0
    row.direct_roas = row.ad_spend > 0 ? row.direct_gmv / row.ad_spend : 0
    row.acos = row.gmv > 0 ? row.ad_spend / row.gmv : 0
    row.direct_acos = row.direct_gmv > 0 ? row.ad_spend / row.direct_gmv : 0
    row.ctr = row.impressions > 0 ? row.clicks / row.impressions : 0
    row.conversion_rate = row.clicks > 0 ? row.conversions / row.clicks : 0
    row.direct_conversion_rate = row.clicks > 0 ? row.direct_conversions / row.clicks : 0
    row.cost_per_conversion = row.conversions > 0 ? row.ad_spend / row.conversions : 0
    row.cost_per_direct_conversion = row.direct_conversions > 0 ? row.ad_spend / row.direct_conversions : 0
  }

  await ensureProfileRow(ctx.supabase, ctx.userId, ctx.userEmail)
  const storeId = await resolveUploadStore(ctx.supabase, ctx.userId, ctx.requestedStoreId, ctx.marketplace)

  await setProgress(ctx, 25, 'Menyiapkan batch upload')

  const { data: batch, error: batchError } = await ctx.supabase
    .from('upload_batches')
    .insert({
      user_id: ctx.userId,
      store_id: storeId,
      file_name: ctx.fileName,
      file_type: 'ads',
      marketplace: ctx.marketplace,
      record_count: rows.length,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(`Gagal menyimpan batch upload: ${batchError?.message ?? 'unknown error'}`)
  }

  const adsRows = rows.map((row) => ({
    user_id: ctx.userId,
    store_id: storeId,
    upload_batch_id: batch.id,
    marketplace: ctx.marketplace,
    ad_name: row.ad_name,
    ad_status: row.ad_status,
    parent_iklan: null,
    product_name: row.product_name,
    product_code: row.product_code,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    conversions: row.conversions,
    direct_conversions: row.direct_conversions,
    conversion_rate: row.conversion_rate,
    direct_conversion_rate: row.direct_conversion_rate,
    cost_per_conversion: row.cost_per_conversion,
    cost_per_direct_conversion: row.cost_per_direct_conversion,
    units_sold: row.units_sold,
    direct_units_sold: row.direct_units_sold,
    gmv: row.gmv,
    direct_gmv: row.direct_gmv,
    ad_spend: row.ad_spend,
    roas: row.roas,
    direct_roas: row.direct_roas,
    acos: row.acos,
    direct_acos: row.direct_acos,
    voucher_amount: row.voucher_amount,
    vouchered_sales: row.vouchered_sales,
    report_period_start: periodStart,
    report_period_end: periodEnd,
  }))

  if (shopAggregate) {
    adsRows.push({
      user_id: ctx.userId,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace: ctx.marketplace,
      ad_name: shopAggregate.ad_name ?? 'Shop GMV Max (Agregat)',
      ad_status: shopAggregate.ad_status,
      parent_iklan: null,
      product_name: shopAggregate.ad_name ?? 'Shop GMV Max (Agregat)',
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
  let insertedCount = 0
  let updatedCount = 0
  const unchangedCount = 0
  const warnings: string[] = []

  if (periodStart && periodEnd) {
    const { count: existingCount } = await ctx.supabase
      .from('ads_data')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .lte('report_period_start', periodEnd)
      .gte('report_period_end', periodStart)

    if ((existingCount ?? 0) > 0) {
      const { error: deleteErr } = await ctx.supabase
        .from('ads_data')
        .delete()
        .eq('store_id', storeId)
        .lte('report_period_start', periodEnd)
        .gte('report_period_end', periodStart)
      if (deleteErr) {
        console.error('Ads wipe-period error:', deleteErr.message)
        warnings.push(`Gagal wipe data periode lama: ${deleteErr.message}`)
      } else {
        updatedCount = existingCount ?? 0
      }
    }
  } else {
    warnings.push(
      'Periode tidak terdeteksi dari metadata file. Data baru di-insert tanpa menghapus data periode lama — kemungkinan muncul duplikat.'
    )
  }

  await setProgress(ctx, 55, 'Menyimpan data iklan')

  for (let i = 0; i < adsRows.length; i += CHUNK) {
    const chunk = adsRows.slice(i, i + CHUNK)
    const { error } = await ctx.supabase.from('ads_data').insert(chunk)
    if (error) {
      console.error('Ads insert error:', error.message)
      warnings.push(`Sebagian data iklan gagal disimpan: ${error.message}`)
    } else {
      insertedCount += chunk.length
    }
  }

  if (updatedCount > 0) {
    const actualUpdated = Math.min(updatedCount, insertedCount)
    const actualInserted = insertedCount - actualUpdated
    updatedCount = actualUpdated
    insertedCount = actualInserted
  }

  const duplicateCount = unchangedCount

  await ctx.supabase
    .from('upload_batches')
    .update({ record_count: insertedCount + updatedCount })
    .eq('id', batch.id)

  let newProducts = 0
  for (const row of rows) {
    if (!row.product_code || row.product_code === '-') continue

    const { data: existing } = await ctx.supabase
      .from('master_products')
      .select('id')
      .eq('store_id', storeId)
      .eq('marketplace_product_id', row.product_code)
      .maybeSingle()

    if (!existing) {
      const { error } = await ctx.supabase.from('master_products').insert({
        user_id: ctx.userId,
        store_id: storeId,
        marketplace_product_id: row.product_code,
        product_name: row.product_name ?? `Produk ${row.product_code}`,
        marketplace: ctx.marketplace,
        hpp: 0,
        packaging_cost: 0,
      })
      if (!error) newProducts++
    }
  }

  await setProgress(ctx, 85, 'Membersihkan produk duplikat')

  const orphanCount = await cleanupOrphanMasterProducts(ctx.supabase, storeId)
  if (orphanCount > 0) {
    console.log(`Cleaned up ${orphanCount} orphan master_products`)
    warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
  }

  return {
    batchId: batch.id,
    recordCount: rows.length,
    insertedCount,
    updatedCount,
    unchangedCount,
    duplicateCount,
    newProducts,
    periodStart,
    periodEnd,
    warnings,
    storeId,
  }
}

export async function processAdsProductUpload(ctx: UploadProcessorContext): Promise<UploadJobResult> {
  await setProgress(ctx, 10, 'Membaca file GMV Max')

  const text = ctx.buffer.toString('utf8')
  const firstNonEmpty = text.split('\n').find((line) => line.trim() !== '')
  if (!firstNonEmpty || !firstNonEmpty.includes('Shop GMV Max')) {
    throw new Error('Format file tidak valid. File harus berupa laporan Shop GMV Max - Laporan Detail Produk dari Shopee Ads.')
  }

  const parseResult = parseShopeeAdsProduct(text)
  const { rows: rawRows, shopAggregate, parentIklan } = parseResult
  const periodStart = ensureValidDate(parseResult.periodStart)
  const periodEnd = ensureValidDate(parseResult.periodEnd)

  if (rawRows.length === 0) {
    throw new Error('Tidak ada data produk ditemukan dalam file. Pastikan file CSV Shop GMV Max Detail Produk yang kamu upload.')
  }

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

  for (const row of rows) {
    row.roas = row.ad_spend > 0 ? row.gmv / row.ad_spend : 0
    row.direct_roas = row.ad_spend > 0 ? row.direct_gmv / row.ad_spend : 0
    row.acos = row.gmv > 0 ? row.ad_spend / row.gmv : 0
    row.direct_acos = row.direct_gmv > 0 ? row.ad_spend / row.direct_gmv : 0
    row.ctr = row.impressions > 0 ? row.clicks / row.impressions : 0
    row.conversion_rate = row.clicks > 0 ? row.conversions / row.clicks : 0
    row.direct_conversion_rate = row.clicks > 0 ? row.direct_conversions / row.clicks : 0
    row.cost_per_conversion = row.conversions > 0 ? row.ad_spend / row.conversions : 0
    row.cost_per_direct_conversion = row.direct_conversions > 0 ? row.ad_spend / row.direct_conversions : 0
  }

  await ensureProfileRow(ctx.supabase, ctx.userId, ctx.userEmail)
  const storeId = await resolveUploadStore(ctx.supabase, ctx.userId, ctx.requestedStoreId, ctx.marketplace)

  await setProgress(ctx, 25, 'Menyiapkan batch upload')

  const { data: batch, error: batchError } = await ctx.supabase
    .from('upload_batches')
    .insert({
      user_id: ctx.userId,
      store_id: storeId,
      file_name: ctx.fileName,
      file_type: 'ads_product',
      marketplace: ctx.marketplace,
      record_count: rows.length,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(`Gagal menyimpan batch upload: ${batchError?.message ?? 'unknown error'}`)
  }

  const adsRows = rows.map((row) => ({
    user_id: ctx.userId,
    store_id: storeId,
    upload_batch_id: batch.id,
    marketplace: ctx.marketplace,
    ad_name: null,
    ad_status: null,
    parent_iklan: parentIklan,
    product_name: row.product_name,
    product_code: row.product_code,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    conversions: row.conversions,
    direct_conversions: row.direct_conversions,
    conversion_rate: row.conversion_rate,
    direct_conversion_rate: row.direct_conversion_rate,
    cost_per_conversion: row.cost_per_conversion,
    cost_per_direct_conversion: row.cost_per_direct_conversion,
    units_sold: row.units_sold,
    direct_units_sold: row.direct_units_sold,
    gmv: row.gmv,
    direct_gmv: row.direct_gmv,
    ad_spend: row.ad_spend,
    roas: row.roas,
    direct_roas: row.direct_roas,
    acos: row.acos,
    direct_acos: row.direct_acos,
    voucher_amount: row.voucher_amount,
    vouchered_sales: row.vouchered_sales,
    report_period_start: periodStart,
    report_period_end: periodEnd,
  }))

  if (shopAggregate) {
    adsRows.push({
      user_id: ctx.userId,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace: ctx.marketplace,
      ad_name: null,
      ad_status: null,
      parent_iklan: parentIklan,
      product_name: 'Shop GMV Max (Total)',
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
  let insertedCount = 0
  let updatedCount = 0
  const unchangedCount = 0
  const warnings: string[] = []

  if (!parentIklan) {
    warnings.push(
      'Parent Iklan tidak terdeteksi dari metadata file. Detail per produk tidak akan ter-link ke kampanye di Traffic Light — wipe lalu upload ulang file Format 2, atau pastikan baris "Parent Iklan: <Nama Kampanye>" ada di header CSV.'
    )
  }

  if (periodStart && periodEnd) {
    const { count: existingCount } = await ctx.supabase
      .from('ads_data')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .is('ad_name', null)
      .lte('report_period_start', periodEnd)
      .gte('report_period_end', periodStart)

    if ((existingCount ?? 0) > 0) {
      const { error: deleteErr } = await ctx.supabase
        .from('ads_data')
        .delete()
        .eq('store_id', storeId)
        .is('ad_name', null)
        .lte('report_period_start', periodEnd)
        .gte('report_period_end', periodStart)
      if (deleteErr) {
        console.error('Ads product wipe-period error:', deleteErr.message)
        warnings.push(`Gagal wipe data periode lama: ${deleteErr.message}`)
      } else {
        updatedCount = existingCount ?? 0
      }
    }
  } else {
    warnings.push(
      'Periode tidak terdeteksi dari metadata file. Data baru di-insert tanpa menghapus data periode lama — kemungkinan muncul duplikat.'
    )
  }

  await setProgress(ctx, 55, 'Menyimpan data per produk')

  for (let i = 0; i < adsRows.length; i += CHUNK) {
    const chunk = adsRows.slice(i, i + CHUNK)
    const { error } = await ctx.supabase.from('ads_data').insert(chunk)
    if (error) {
      console.error('Ads product insert error:', error.message)
      warnings.push(`Sebagian data produk gagal disimpan: ${error.message}`)
    } else {
      insertedCount += chunk.length
    }
  }

  if (updatedCount > 0) {
    const actualUpdated = Math.min(updatedCount, insertedCount)
    const actualInserted = insertedCount - actualUpdated
    updatedCount = actualUpdated
    insertedCount = actualInserted
  }

  const duplicateCount = unchangedCount

  await ctx.supabase
    .from('upload_batches')
    .update({ record_count: insertedCount + updatedCount })
    .eq('id', batch.id)

  let newProducts = 0
  for (const row of rows) {
    if (!row.product_code || row.product_code === '-') continue

    const { data: existing } = await ctx.supabase
      .from('master_products')
      .select('id')
      .eq('store_id', storeId)
      .eq('marketplace_product_id', row.product_code)
      .maybeSingle()

    if (!existing) {
      const { error } = await ctx.supabase.from('master_products').insert({
        user_id: ctx.userId,
        store_id: storeId,
        marketplace_product_id: row.product_code,
        product_name: row.product_name ?? `Produk ${row.product_code}`,
        marketplace: ctx.marketplace,
        hpp: 0,
        packaging_cost: 0,
      })
      if (!error) newProducts++
    }
  }

  await setProgress(ctx, 85, 'Membersihkan produk duplikat')

  const orphanCount = await cleanupOrphanMasterProducts(ctx.supabase, storeId)
  if (orphanCount > 0) {
    console.log(`Cleaned up ${orphanCount} orphan master_products`)
    warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
  }

  return {
    batchId: batch.id,
    recordCount: rows.length,
    insertedCount,
    updatedCount,
    unchangedCount,
    duplicateCount,
    newProducts,
    periodStart,
    periodEnd,
    warnings,
    storeId,
  }
}

export async function processIncomeUpload(ctx: UploadProcessorContext): Promise<UploadJobResult> {
  await setProgress(ctx, 10, 'Membaca file income')

  const parseResult = parseShopeeIncome(ctx.buffer)
  const { orders, orderProducts: opfRows } = parseResult
  const periodStart = ensureValidDate(parseResult.periodStart)
  const periodEnd = ensureValidDate(parseResult.periodEnd)

  for (const order of orders) {
    order.order_date = ensureValidDate(order.order_date)
    order.release_date = ensureValidDate(order.release_date)
  }

  if (orders.length === 0) {
    throw new Error('Tidak ada data order ditemukan dalam file. Pastikan file income Shopee yang kamu upload.')
  }

  await ensureProfileRow(ctx.supabase, ctx.userId, ctx.userEmail)
  const storeId = await resolveUploadStore(ctx.supabase, ctx.userId, ctx.requestedStoreId, ctx.marketplace)

  const { count: ordersAllCount } = await ctx.supabase
    .from('orders_all')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if (!ordersAllCount || ordersAllCount === 0) {
    throw new Error(
      'Upload file Order.all dulu untuk store ini. Order.all berisi mapping produk per pesanan yang dibutuhkan untuk membuat master produk dan menghitung HPP. Income hanya berisi data finansial.'
    )
  }

  await setProgress(ctx, 25, 'Menyiapkan batch upload')

  const { data: batch, error: batchError } = await ctx.supabase
    .from('upload_batches')
    .insert({
      user_id: ctx.userId,
      store_id: storeId,
      file_name: ctx.fileName,
      file_type: 'income',
      marketplace: ctx.marketplace,
      record_count: orders.length,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(`Gagal menyimpan batch upload: ${batchError?.message ?? 'unknown error'}`)
  }

  const incomingOrderNumbers = orders.map((order) => order.order_number)
  const existingMap = new Map<string, Record<string, unknown>>()
  const QUERY_CHUNK = 500
  const selectCols = ['order_number', ...ORDER_COMPARE_FIELDS].join(', ')

  for (let i = 0; i < incomingOrderNumbers.length; i += QUERY_CHUNK) {
    const slice = incomingOrderNumbers.slice(i, i + QUERY_CHUNK)
    const { data: existingOrders } = await ctx.supabase
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
    (row) => (row as { order_number: string }).order_number,
    ORDER_COMPARE_FIELDS as unknown as readonly string[],
  )

  const CHUNK = 500
  const toInsertRows = (toInsert as unknown as typeof orders).map((order) => ({
    ...order,
    user_id: ctx.userId,
    store_id: storeId,
    upload_batch_id: batch.id,
    marketplace: ctx.marketplace,
  }))
  const toUpdateRows = (toUpdate as unknown as typeof orders).map((order) => ({
    ...order,
    user_id: ctx.userId,
    store_id: storeId,
    upload_batch_id: batch.id,
    marketplace: ctx.marketplace,
  }))

  let insertedCount = 0
  let updatedCount = 0
  const warnings: string[] = []

  await setProgress(ctx, 45, 'Menyimpan data income')

  for (let i = 0; i < toInsertRows.length; i += CHUNK) {
    const chunk = toInsertRows.slice(i, i + CHUNK)
    const { error } = await ctx.supabase
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

  for (let i = 0; i < toUpdateRows.length; i += CHUNK) {
    const chunk = toUpdateRows.slice(i, i + CHUNK)
    const { error } = await ctx.supabase
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

  const opfRowsTotal = opfRows.length
  let opfMatchedTotal = 0
  let opfUnmatchedTotal = 0
  const opfUnmatchedSamples: Array<{ id: string | null; name: string | null }> = []
  let opUpsertSuccess = 0

  if (opfRows.length > 0) {
    try {
      const { data: masterRows } = await ctx.supabase
        .from('master_products')
        .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
        .eq('store_id', storeId)

      const resolver = new MasterResolver((masterRows ?? []) as ResolverMasterRow[])
      const numericIdUpdates = new Map<string, string>()
      const perOrderAgg = new Map<string, Map<string, { name: string | null; qty: number }>>()
      let opfMatched = 0
      let opfUnmatched = 0

      for (const op of opfRows) {
        const master = resolver.resolve({
          anyId: op.marketplace_product_id,
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

        if (!master.numeric_id && op.marketplace_product_id) {
          numericIdUpdates.set(master.id, op.marketplace_product_id)
        }

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

      for (const [masterId, numericId] of Array.from(numericIdUpdates.entries())) {
        await ctx.supabase
          .from('master_products')
          .update({ numeric_id: numericId })
          .eq('id', masterId)
      }

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
            user_id: ctx.userId,
            store_id: storeId,
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
        const { error } = await ctx.supabase
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
      if (opfUnmatched > 0 && opfMatched === 0) {
        warnings.push(
          `${opfUnmatched} baris OPF tidak match dengan master produk. Pastikan master produk sudah diisi (upload Order.all dulu untuk auto-create master).`
        )
      }
    } catch (opfError) {
      console.error('Income OPF processing error:', opfError)
    }
  }

  await setProgress(ctx, 75, 'Menghitung HPP estimasi')

  try {
    const incomeOrderNums = orders.map((order) => order.order_number)
    type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
    const opRows2: OpRow[] = []
    const OP_CHUNK2 = 200

    for (let i = 0; i < incomeOrderNums.length; i += OP_CHUNK2) {
      const chunk = incomeOrderNums.slice(i, i + OP_CHUNK2)
      const { data } = await ctx.supabase
        .from('order_products')
        .select('order_number,marketplace_product_id,product_name,quantity')
        .eq('store_id', storeId)
        .in('order_number', chunk)
      if (data) opRows2.push(...(data as OpRow[]))
    }

    const orderToProducts = new Map<string, Array<{ id: string; name: string | null; qty: number }>>()
    for (const row of opRows2) {
      const entries = orderToProducts.get(row.order_number) ?? []
      entries.push({ id: row.marketplace_product_id, name: row.product_name, qty: row.quantity ?? 1 })
      orderToProducts.set(row.order_number, entries)
    }

    const { data: masterRows2 } = await ctx.supabase
      .from('master_products')
      .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
      .eq('store_id', storeId)
    const resolver2 = new MasterResolver((masterRows2 ?? []) as ResolverMasterRow[])

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

      const { error: updateError } = await ctx.supabase
        .from('orders')
        .update({ estimated_hpp: estimatedHpp })
        .eq('store_id', storeId)
        .eq('order_number', order.order_number)
      void updateError
    }

    if (ordersWithoutMapping > 0) {
      warnings.push(
        `${ordersWithoutMapping} dari ${orders.length} order belum punya mapping produk. Pastikan master produk sudah diisi.`
      )
    }

    const oaRows: { id: string; order_number: string; products_json: unknown }[] = []
    const OA_CHUNK = 200
    for (let i = 0; i < incomeOrderNums.length; i += OA_CHUNK) {
      const { data } = await ctx.supabase
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

        await ctx.supabase
          .from('orders_all')
          .update({ estimated_hpp: estimatedHpp })
          .eq('id', row.id)
      }
    }
  } catch (hppError) {
    console.error('Income HPP recalc error:', hppError)
  }

  const newProducts = 0

  await ctx.supabase
    .from('upload_batches')
    .update({ record_count: insertedCount + updatedCount })
    .eq('id', batch.id)

  await setProgress(ctx, 88, 'Membersihkan produk duplikat')

  const orphanCount = await cleanupOrphanMasterProducts(ctx.supabase, storeId)
  if (orphanCount > 0) {
    console.log(`Cleaned up ${orphanCount} orphan master_products`)
    warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
  }

  if (opfRowsTotal === 0) {
    warnings.push(
      '⚠️ Sheet "Order Processing Fee" di file income kosong / tidak ditemukan. HPP tidak bisa dihitung tanpa data OPF. Pastikan kamu download file dari Keuangan → Penghasilan Saya (bukan Income Summary saja).'
    )
  } else if (opfUnmatchedTotal > 0) {
    const pct = Math.round((opfUnmatchedTotal / opfRowsTotal) * 100)
    warnings.push(
      `OPF: ${opfMatchedTotal}/${opfRowsTotal} baris match master (${pct}% gagal match). Sample produk gagal match: ${opfUnmatchedSamples
        .slice(0, 3)
        .map((sample) => sample.name ?? sample.id ?? '?')
        .join(' · ')}. Upload Order.all dulu supaya master produk lengkap.`
    )
  }

  return {
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
    storeId,
  }
}

export async function processOrdersAllUpload(ctx: UploadProcessorContext): Promise<UploadJobResult> {
  await setProgress(ctx, 10, 'Membaca file Order.all')

  const parseResult = parseShopeeOrdersAll(ctx.buffer)
  const { orders } = parseResult
  const periodStart = ensureValidDate(parseResult.periodStart)
  const periodEnd = ensureValidDate(parseResult.periodEnd)

  if (orders.length === 0) {
    throw new Error('Tidak ada data pesanan ditemukan.')
  }

  await ensureProfileRow(ctx.supabase, ctx.userId, ctx.userEmail)
  const storeId = await resolveUploadStore(ctx.supabase, ctx.userId, ctx.requestedStoreId, ctx.marketplace)

  const { data: existing } = await ctx.supabase
    .from('orders_all')
    .select('order_number')
    .eq('store_id', storeId)
  const existingSet = new Set((existing ?? []).map((row) => row.order_number))

  await setProgress(ctx, 25, 'Menyiapkan batch upload')

  const { data: batch, error: batchError } = await ctx.supabase
    .from('upload_batches')
    .insert({
      user_id: ctx.userId,
      store_id: storeId,
      file_name: ctx.fileName,
      file_type: 'orders_all',
      marketplace: ctx.marketplace,
      record_count: orders.length,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(`Gagal menyimpan batch: ${batchError?.message ?? 'unknown error'}`)
  }

  const warnings: string[] = []

  if (periodStart && periodEnd) {
    const { error: deleteError } = await ctx.supabase
      .from('orders_all')
      .delete()
      .eq('store_id', storeId)
      .lte('order_date', periodEnd)
      .gte('order_date', periodStart)
    if (deleteError) warnings.push(`Gagal menghapus data lama: ${deleteError.message}`)
  } else {
    const { error: deleteError } = await ctx.supabase
      .from('orders_all')
      .delete()
      .eq('store_id', storeId)
    if (deleteError) warnings.push(`Gagal menghapus data lama: ${deleteError.message}`)
  }

  type OpUpsertRow = {
    user_id: string
    store_id: string
    order_number: string
    marketplace_product_id: string
    product_name: string | null
    quantity: number
  }

  const opUpsertRows: OpUpsertRow[] = []
  for (const order of orders) {
    const perOrderAgg = new Map<string, { name: string | null; qty: number }>()
    for (const product of order.products_json ?? []) {
      if (!product.marketplace_product_id) continue

      const existingRow = perOrderAgg.get(product.marketplace_product_id)
      if (existingRow) {
        existingRow.qty += product.quantity
      } else {
        perOrderAgg.set(product.marketplace_product_id, {
          name: product.product_name,
          qty: product.quantity,
        })
      }
    }

    for (const [sku, info] of Array.from(perOrderAgg.entries())) {
      opUpsertRows.push({
        user_id: ctx.userId,
        store_id: storeId,
        order_number: order.order_number,
        marketplace_product_id: sku,
        product_name: info.name,
        quantity: info.qty,
      })
    }
  }

  await setProgress(ctx, 40, 'Menyimpan mapping produk')

  const OP_CHUNK = 500
  let opInserted = 0
  for (let i = 0; i < opUpsertRows.length; i += OP_CHUNK) {
    const chunk = opUpsertRows.slice(i, i + OP_CHUNK)
    const { error } = await ctx.supabase
      .from('order_products')
      .upsert(chunk, {
        onConflict: 'store_id,order_number,marketplace_product_id',
        ignoreDuplicates: false,
      })
    if (error) {
      console.error('order_products upsert error:', error.message)
      warnings.push(`Sebagian mapping produk gagal disimpan: ${error.message}`)
    } else {
      opInserted += chunk.length
    }
  }
  console.log(`Upserted ${opInserted}/${opUpsertRows.length} order_products rows from Order.all`)

  const skuToName = new Map<string, string>()
  for (const order of orders) {
    for (const product of order.products_json ?? []) {
      if (product.marketplace_product_id && product.product_name && !skuToName.has(product.marketplace_product_id)) {
        skuToName.set(product.marketplace_product_id, product.product_name)
      }
    }
  }

  let migratedCount = 0
  let createdCount = 0
  if (skuToName.size > 0) {
    const { data: existingMasters } = await ctx.supabase
      .from('master_products')
      .select('id,marketplace_product_id,product_name,hpp,packaging_cost,store_id')
      .eq('store_id', storeId)

    type ExistingMasterRow = {
      id: string
      marketplace_product_id: string
      product_name: string | null
      hpp: number
      packaging_cost: number
      store_id: string | null
    }

    const existingByName = new Map<string, ExistingMasterRow>()
    const existingBySku = new Set<string>()

    for (const master of (existingMasters ?? []) as ExistingMasterRow[]) {
      if (master.product_name) {
        const normalizedName = normalizeName(master.product_name)
        const prev = existingByName.get(normalizedName)
        if (!prev || /^\d+$/.test(prev.marketplace_product_id)) {
          existingByName.set(normalizedName, master)
        }
      }
      existingBySku.add(master.marketplace_product_id)
    }

    for (const [sku, name] of Array.from(skuToName.entries())) {
      if (existingBySku.has(sku)) continue

      const normalizedName = normalizeName(name)
      const matched = existingByName.get(normalizedName)
      const isMatchedNumeric = matched && /^\d+$/.test(matched.marketplace_product_id)

      if (matched && isMatchedNumeric) {
        const { error: renameError } = await ctx.supabase
          .from('master_products')
          .update({
            marketplace_product_id: sku,
            numeric_id: matched.marketplace_product_id,
          })
          .eq('id', matched.id)
        if (renameError) {
          console.error(`Failed to migrate master "${name}" (${matched.marketplace_product_id} → ${sku}):`, renameError.message)
        } else {
          existingBySku.add(sku)
          existingByName.delete(normalizedName)
          migratedCount++
        }
      } else if (!matched) {
        const { error: createError } = await ctx.supabase
          .from('master_products')
          .insert({
            user_id: ctx.userId,
            store_id: storeId,
            marketplace_product_id: sku,
            product_name: name,
            marketplace: ctx.marketplace,
            hpp: 0,
            packaging_cost: 0,
          })
        if (createError) {
          console.error(`Failed to create master "${name}" (${sku}):`, createError.message)
        } else {
          existingBySku.add(sku)
          createdCount++
        }
      }
    }
  }

  const { data: allMasters } = await ctx.supabase
    .from('master_products')
    .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
    .eq('store_id', storeId)
  const resolver = new MasterResolver((allMasters ?? []) as ResolverMasterRow[])

  const rows = orders.map((order) => {
    let estimatedHpp = 0
    for (const product of order.products_json ?? []) {
      const master = resolver.resolve({
        anyId: product.marketplace_product_id,
        productName: product.product_name,
      })
      if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
        estimatedHpp += (master.hpp + master.packaging_cost) * product.quantity
      }
    }

    return {
      order_number: order.order_number,
      status_pesanan: order.status_pesanan,
      total_pembayaran: order.total_pembayaran,
      seller_voucher: order.seller_voucher,
      order_date: order.order_date,
      order_complete_date: order.order_complete_date,
      products_json: order.products_json,
      estimated_hpp: estimatedHpp,
      user_id: ctx.userId,
      store_id: storeId,
      upload_batch_id: batch.id,
      marketplace: ctx.marketplace,
    }
  })

  await setProgress(ctx, 70, 'Menyimpan semua pesanan')

  const CHUNK = 500
  let insertedCount = 0
  let updatedCount = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await ctx.supabase.from('orders_all').upsert(chunk, {
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

  try {
    const incomeOrderNums = orders.map((order) => order.order_number)
    const orderToProducts = new Map<string, Array<{ id: string; name: string | null; qty: number }>>()

    for (const op of opUpsertRows) {
      const entries = orderToProducts.get(op.order_number) ?? []
      entries.push({ id: op.marketplace_product_id, name: op.product_name, qty: op.quantity })
      orderToProducts.set(op.order_number, entries)
    }

    let backfilledCount = 0
    const UPDATE_CHUNK = 100
    for (let i = 0; i < incomeOrderNums.length; i += UPDATE_CHUNK) {
      const chunk = incomeOrderNums.slice(i, i + UPDATE_CHUNK)
      for (const orderNum of chunk) {
        const items = orderToProducts.get(orderNum) ?? []
        let estimatedHpp = 0
        for (const item of items) {
          const master = resolver.resolve({ anyId: item.id, productName: item.name })
          if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
            estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
          }
        }
        const { error: updateError } = await ctx.supabase
          .from('orders')
          .update({ estimated_hpp: estimatedHpp })
          .eq('store_id', storeId)
          .eq('order_number', orderNum)
        if (!updateError) backfilledCount++
      }
    }
    console.log(`Backfilled estimated_hpp for ${backfilledCount} income orders`)
  } catch (backfillError) {
    console.error('Income orders estimated_hpp backfill error:', backfillError)
  }

  await ctx.supabase
    .from('upload_batches')
    .update({ record_count: insertedCount + updatedCount })
    .eq('id', batch.id)

  await setProgress(ctx, 88, 'Membersihkan produk duplikat')

  const orphanCount = await cleanupOrphanMasterProducts(ctx.supabase, storeId)
  if (orphanCount > 0) {
    console.log(`Cleaned up ${orphanCount} orphan master_products`)
    warnings.push(`${orphanCount} produk duplikat/orphan dihapus otomatis`)
  }

  return {
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
    storeId,
  }
}
