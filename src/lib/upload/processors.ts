import type { LocalSupabaseClient } from '@/lib/postgres/local-client'
import { cleanupOrphanMasterProducts } from '@/lib/cleanup-orphan-products'
import { syncSaleOutInventory } from '@/lib/inventory/sync-sale-out'
import { MasterResolver, type MasterRow as ResolverMasterRow } from '@/lib/master-resolver'
import { parseShopeeAds } from '@/lib/parsers/shopee-ads'
import { parseShopeeAdsProduct } from '@/lib/parsers/shopee-ads-product'
import { parseShopeeIncome } from '@/lib/parsers/shopee-income'
import { parseShopeeOrdersAll } from '@/lib/parsers/shopee-orders-all'
import { classifyIncomingRows } from '@/lib/upload/dedupe'
import type { MasterProductSourceTag, UploadFileType, UploadJobResult } from '@/types'
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
  supabase: LocalSupabaseClient
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

type MasterProductRow = ResolverMasterRow & {
  seller_sku: string | null
  source_tags: string[] | null
}

const MASTER_PRODUCT_SELECT = 'id,marketplace_product_id,seller_sku,numeric_id,product_name,hpp,packaging_cost,source_tags'

function mergeSourceTags(
  existing: string[] | null | undefined,
  incoming: MasterProductSourceTag,
): MasterProductSourceTag[] {
  const next = new Set<MasterProductSourceTag>((existing ?? []) as MasterProductSourceTag[])
  next.add(incoming)
  return Array.from(next)
}

async function loadMasterRows(
  supabase: LocalSupabaseClient,
  storeId: string,
): Promise<MasterProductRow[]> {
  const { data } = await supabase
    .from('master_products')
    .select(MASTER_PRODUCT_SELECT)
    .eq('store_id', storeId)

  return (data ?? []) as MasterProductRow[]
}

function replaceMasterRow(rows: MasterProductRow[], next: MasterProductRow) {
  const index = rows.findIndex((row) => row.id === next.id)
  if (index === -1) rows.push(next)
  else rows[index] = next
}

async function syncMasterProductsFromNumericRows(params: {
  supabase: LocalSupabaseClient
  userId: string
  storeId: string
  marketplace: string
  sourceTag: MasterProductSourceTag
  rows: Array<{ productId: string | null; productName: string | null }>
}): Promise<{ masterRows: MasterProductRow[]; createdCount: number; migratedCount: number }> {
  const uniqueRows = new Map<string, { productId: string; productName: string | null }>()
  for (const row of params.rows) {
    if (!row.productId) continue
    const existing = uniqueRows.get(row.productId)
    if (!existing || (!existing.productName && row.productName)) {
      uniqueRows.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
      })
    }
  }

  const masterRows = await loadMasterRows(params.supabase, params.storeId)
  let resolver = new MasterResolver(masterRows)
  const byCanonicalId = new Map(masterRows.map((row) => [row.marketplace_product_id, row]))
  let createdCount = 0
  let migratedCount = 0

  for (const row of Array.from(uniqueRows.values())) {
    const direct = byCanonicalId.get(row.productId)
    if (direct) {
      const nextSourceTags = mergeSourceTags(direct.source_tags, params.sourceTag)
      const nextNumericId =
        params.sourceTag === 'income'
          ? row.productId
          : direct.numeric_id
      if (
        (row.productName &&
          (!direct.product_name || direct.product_name === `Produk ${row.productId}`) &&
          direct.product_name !== row.productName) ||
        nextSourceTags.length !== (direct.source_tags ?? []).length ||
        nextNumericId !== direct.numeric_id
      ) {
        const { data: updated } = await params.supabase
          .from('master_products')
          .update({
            product_name: row.productName ?? direct.product_name,
            numeric_id: nextNumericId,
            source_tags: nextSourceTags,
          })
          .eq('id', direct.id)
          .select(MASTER_PRODUCT_SELECT)
          .single()
        if (updated) {
          const typedUpdated = updated as MasterProductRow
          replaceMasterRow(masterRows, typedUpdated)
          byCanonicalId.set(typedUpdated.marketplace_product_id, typedUpdated)
          resolver = new MasterResolver(masterRows)
        }
      }
      continue
    }

    const matchedByName = (row.productName
      ? resolver.resolve({ productName: row.productName })
      : undefined
    ) as MasterProductRow | undefined

    if (
      matchedByName &&
      matchedByName.marketplace_product_id !== row.productId &&
      !/^\d+$/.test(matchedByName.marketplace_product_id)
    ) {
      const { data: updated } = await params.supabase
        .from('master_products')
        .update({
          marketplace_product_id: row.productId,
          seller_sku: matchedByName.seller_sku ?? matchedByName.marketplace_product_id,
          numeric_id: params.sourceTag === 'income' ? row.productId : matchedByName.numeric_id,
          product_name: row.productName ?? matchedByName.product_name,
          source_tags: mergeSourceTags(matchedByName.source_tags, params.sourceTag),
        })
        .eq('id', matchedByName.id)
        .select(MASTER_PRODUCT_SELECT)
        .single()

      if (updated) {
        const typedUpdated = updated as MasterProductRow
        replaceMasterRow(masterRows, typedUpdated)
        byCanonicalId.delete(matchedByName.marketplace_product_id)
        byCanonicalId.set(typedUpdated.marketplace_product_id, typedUpdated)
        resolver = new MasterResolver(masterRows)
        migratedCount++
        continue
      }
    }

    const { data: inserted } = await params.supabase
      .from('master_products')
      .insert({
        user_id: params.userId,
        store_id: params.storeId,
        marketplace_product_id: row.productId,
        seller_sku: null,
        numeric_id: params.sourceTag === 'income' ? row.productId : null,
        product_name: row.productName ?? `Produk ${row.productId}`,
        source_tags: [params.sourceTag],
        marketplace: params.marketplace,
        hpp: 0,
        packaging_cost: 0,
      })
      .select(MASTER_PRODUCT_SELECT)
      .single()

    if (inserted) {
      const typedInserted = inserted as MasterProductRow
      masterRows.push(typedInserted)
      byCanonicalId.set(typedInserted.marketplace_product_id, typedInserted)
      resolver = new MasterResolver(masterRows)
      createdCount++
    }
  }

  return { masterRows, createdCount, migratedCount }
}

async function syncMasterProductsFromSellerSkus(params: {
  supabase: LocalSupabaseClient
  userId: string
  storeId: string
  marketplace: string
  sourceTag: MasterProductSourceTag
  rows: Array<{ sellerSku: string | null; productName: string | null }>
}): Promise<{
  masterRows: MasterProductRow[]
  createdCount: number
  enrichedCount: number
  skuToCanonicalId: Map<string, string>
}> {
  const uniqueRows = new Map<string, { sellerSku: string; productName: string | null }>()
  for (const row of params.rows) {
    if (!row.sellerSku) continue
    const existing = uniqueRows.get(row.sellerSku)
    if (!existing || (!existing.productName && row.productName)) {
      uniqueRows.set(row.sellerSku, {
        sellerSku: row.sellerSku,
        productName: row.productName,
      })
    }
  }

  const masterRows = await loadMasterRows(params.supabase, params.storeId)
  let resolver = new MasterResolver(masterRows)
  const skuToCanonicalId = new Map<string, string>()
  let createdCount = 0
  let enrichedCount = 0

  for (const row of Array.from(uniqueRows.values())) {
    const matched = resolver.resolve({
      anyId: row.sellerSku,
      productName: row.productName,
    }) as MasterProductRow | undefined

    if (matched) {
      skuToCanonicalId.set(row.sellerSku, matched.marketplace_product_id)

      const nextSourceTags = mergeSourceTags(matched.source_tags, params.sourceTag)

      if (
        ((!matched.seller_sku) ||
          nextSourceTags.length !== (matched.source_tags ?? []).length)
      ) {
        const { data: updated } = await params.supabase
          .from('master_products')
          .update({
            seller_sku: matched.seller_sku ?? row.sellerSku,
            product_name: row.productName ?? matched.product_name,
            source_tags: nextSourceTags,
          })
          .eq('id', matched.id)
          .select(MASTER_PRODUCT_SELECT)
          .single()

        if (updated) {
          const typedUpdated = updated as MasterProductRow
          replaceMasterRow(masterRows, typedUpdated)
          resolver = new MasterResolver(masterRows)
          skuToCanonicalId.set(row.sellerSku, typedUpdated.marketplace_product_id)
          enrichedCount++
        }
      }

      continue
    }

    const { data: inserted } = await params.supabase
      .from('master_products')
      .insert({
        user_id: params.userId,
        store_id: params.storeId,
        marketplace_product_id: row.sellerSku,
        seller_sku: row.sellerSku,
        product_name: row.productName ?? row.sellerSku,
        source_tags: [params.sourceTag],
        marketplace: params.marketplace,
        hpp: 0,
        packaging_cost: 0,
      })
      .select(MASTER_PRODUCT_SELECT)
      .single()

    if (inserted) {
      const typedInserted = inserted as MasterProductRow
      masterRows.push(typedInserted)
      resolver = new MasterResolver(masterRows)
      skuToCanonicalId.set(row.sellerSku, typedInserted.marketplace_product_id)
      createdCount++
    }
  }

  return { masterRows, createdCount, enrichedCount, skuToCanonicalId }
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

  const { createdCount: newProducts, migratedCount: migratedMasters } = await syncMasterProductsFromNumericRows({
    supabase: ctx.supabase,
    userId: ctx.userId,
    storeId,
    marketplace: ctx.marketplace,
    sourceTag: 'ads',
    rows: rows.map((row) => ({
      productId: row.product_code === '-' ? null : row.product_code,
      productName: row.product_name,
    })),
  })
  if (migratedMasters > 0) {
    warnings.push(`${migratedMasters} master produk lama disambungkan ke Product ID Shopee dari data iklan`)
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

  const { createdCount: newProducts, migratedCount: migratedMasters } = await syncMasterProductsFromNumericRows({
    supabase: ctx.supabase,
    userId: ctx.userId,
    storeId,
    marketplace: ctx.marketplace,
    sourceTag: 'ads_product',
    rows: rows.map((row) => ({
      productId: row.product_code === '-' ? null : row.product_code,
      productName: row.product_name,
    })),
  })
  if (migratedMasters > 0) {
    warnings.push(`${migratedMasters} master produk lama disambungkan ke Product ID Shopee dari GMV Max`)
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
  let newProducts = 0
  let migratedMasters = 0
  let masterRowsForIncome: MasterProductRow[] = []

  if (opfRows.length > 0) {
    const synced = await syncMasterProductsFromNumericRows({
      supabase: ctx.supabase,
      userId: ctx.userId,
      storeId,
      marketplace: ctx.marketplace,
      sourceTag: 'income',
      rows: opfRows.map((row) => ({
        productId: row.marketplace_product_id,
        productName: row.product_name,
      })),
    })
    masterRowsForIncome = synced.masterRows
    newProducts = synced.createdCount
    migratedMasters = synced.migratedCount
  }

  const opfRowsTotal = opfRows.length
  let opfMatchedTotal = 0
  let opfUnmatchedTotal = 0
  const opfUnmatchedSamples: Array<{ id: string | null; name: string | null }> = []
  let opUpsertSuccess = 0

  if (migratedMasters > 0) {
    warnings.push(`${migratedMasters} master produk lama disambungkan ke Product ID Shopee dari Seller Fee`)
  }

  if (opfRows.length > 0) {
    try {
      const resolver = new MasterResolver(masterRowsForIncome)
      const existingPerOrder = new Map<string, Map<string, { name: string | null; qty: number }>>()
      const EXISTING_CHUNK = 200

      type ExistingOpRow = {
        order_number: string
        marketplace_product_id: string
        product_name: string | null
        quantity: number | null
      }

      for (let i = 0; i < incomingOrderNumbers.length; i += EXISTING_CHUNK) {
        const chunk = incomingOrderNumbers.slice(i, i + EXISTING_CHUNK)
        const { data: existingOrderProducts } = await ctx.supabase
          .from('order_products')
          .select('order_number,marketplace_product_id,product_name,quantity')
          .eq('store_id', storeId)
          .in('order_number', chunk)

        for (const row of (existingOrderProducts ?? []) as ExistingOpRow[]) {
          const master = resolver.resolve({
            anyId: row.marketplace_product_id,
            productName: row.product_name,
          })
          const canonicalId = master?.marketplace_product_id ?? row.marketplace_product_id
          let orderMap = existingPerOrder.get(row.order_number)
          if (!orderMap) {
            orderMap = new Map()
            existingPerOrder.set(row.order_number, orderMap)
          }
          const existing = orderMap.get(canonicalId)
          if (existing) {
            existing.qty += row.quantity ?? 1
          } else {
            orderMap.set(canonicalId, {
              name: master?.product_name ?? row.product_name,
              qty: row.quantity ?? 1,
            })
          }
        }
      }

      const opfPerOrder = new Map<string, Map<string, { name: string | null; qty: number }>>()
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

        let orderMap = opfPerOrder.get(op.order_number)
        if (!orderMap) {
          orderMap = new Map()
          opfPerOrder.set(op.order_number, orderMap)
        }

        const canonicalId = master.marketplace_product_id
        const existing = orderMap.get(canonicalId)
        if (existing) {
          existing.qty += 1
        } else {
          orderMap.set(canonicalId, { name: master.product_name ?? op.product_name, qty: 1 })
        }
      }

      const opUpsertRows: Array<{
        user_id: string
        store_id: string
        order_number: string
        marketplace_product_id: string
        product_name: string | null
        quantity: number
      }> = []

      const finalPerOrder = new Map<string, Map<string, { name: string | null; qty: number }>>()
      for (const orderNum of incomingOrderNumbers) {
        const existingMap = existingPerOrder.get(orderNum)
        const opfMap = opfPerOrder.get(orderNum)
        const finalMap = new Map<string, { name: string | null; qty: number }>()

        if (existingMap && existingMap.size > 0) {
          for (const [canonicalId, info] of Array.from(existingMap.entries())) {
            finalMap.set(canonicalId, { ...info })
          }
        }
        if ((!existingMap || existingMap.size === 0) && opfMap) {
          for (const [canonicalId, info] of Array.from(opfMap.entries())) {
            finalMap.set(canonicalId, { ...info })
          }
        } else if (existingMap && opfMap) {
          for (const [canonicalId, info] of Array.from(opfMap.entries())) {
            if (!finalMap.has(canonicalId)) {
              finalMap.set(canonicalId, { ...info })
            }
          }
        }

        if (finalMap.size > 0) {
          finalPerOrder.set(orderNum, finalMap)
        }
      }

      const OP_DELETE_CHUNK = 200
      for (let i = 0; i < incomingOrderNumbers.length; i += OP_DELETE_CHUNK) {
        const chunk = incomingOrderNumbers.slice(i, i + OP_DELETE_CHUNK)
        const { error } = await ctx.supabase
          .from('order_products')
          .delete()
          .eq('store_id', storeId)
          .in('order_number', chunk)
        if (error) {
          console.error('Income OPF order_products delete error:', error.message)
          warnings.push(`Gagal refresh mapping produk income: ${error.message}`)
        }
      }

      for (const [orderNum, prodMap] of Array.from(finalPerOrder.entries())) {
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
          .insert(chunk)
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
          `${opfUnmatched} baris Seller Fee tidak bisa dipetakan ke master produk. Cek apakah product ID dan nama produk di sheet Seller Fee terbaca dengan benar.`
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
      .select(MASTER_PRODUCT_SELECT)
      .eq('store_id', storeId)
    const resolver2 = new MasterResolver((masterRows2 ?? []) as MasterProductRow[])

    let ordersWithoutMapping = 0
    const orderHppUpdates: { order_number: string; estimatedHpp: number }[] = []
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
      orderHppUpdates.push({ order_number: order.order_number, estimatedHpp })
    }

    // Jalankan UPDATE per-batch paralel (bukan satu-satu seri) supaya cepat.
    const HPP_UPDATE_CONCURRENCY = 25
    for (let i = 0; i < orderHppUpdates.length; i += HPP_UPDATE_CONCURRENCY) {
      await Promise.all(
        orderHppUpdates.slice(i, i + HPP_UPDATE_CONCURRENCY).map((u) =>
          ctx.supabase
            .from('orders')
            .update({ estimated_hpp: u.estimatedHpp })
            .eq('store_id', storeId)
            .eq('order_number', u.order_number)
        )
      )
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
      const oaHppUpdates: { id: string; estimatedHpp: number }[] = []
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
        oaHppUpdates.push({ id: row.id, estimatedHpp })
      }

      for (let i = 0; i < oaHppUpdates.length; i += HPP_UPDATE_CONCURRENCY) {
        await Promise.all(
          oaHppUpdates.slice(i, i + HPP_UPDATE_CONCURRENCY).map((u) =>
            ctx.supabase
              .from('orders_all')
              .update({ estimated_hpp: u.estimatedHpp })
              .eq('id', u.id)
          )
        )
      }
    }
  } catch (hppError) {
    console.error('Income HPP recalc error:', hppError)
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
        .join(' · ')}. Review nama produk / product ID di Seller Fee dan cek Master Produk untuk item yang belum terhubung.`
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

  const sellerSkuRows: Array<{ sellerSku: string | null; productName: string | null }> = []
  for (const order of orders) {
    for (const product of order.products_json ?? []) {
      sellerSkuRows.push({
        sellerSku: product.marketplace_product_id,
        productName: product.product_name,
      })
    }
  }

  const {
    masterRows: masterRowsFromOrdersAll,
    createdCount,
    enrichedCount,
    skuToCanonicalId,
  } = await syncMasterProductsFromSellerSkus({
    supabase: ctx.supabase,
    userId: ctx.userId,
    storeId,
    marketplace: ctx.marketplace,
    sourceTag: 'orders_all',
    rows: sellerSkuRows,
  })

  const opUpsertRows: OpUpsertRow[] = []
  for (const order of orders) {
    const perOrderAgg = new Map<string, { name: string | null; qty: number }>()
    for (const product of order.products_json ?? []) {
      if (!product.marketplace_product_id) continue
      const canonicalId = skuToCanonicalId.get(product.marketplace_product_id) ?? product.marketplace_product_id

      const existingRow = perOrderAgg.get(canonicalId)
      if (existingRow) {
        existingRow.qty += product.quantity
      } else {
        perOrderAgg.set(canonicalId, {
          name: product.product_name,
          qty: product.quantity,
        })
      }
    }

    for (const [canonicalId, info] of Array.from(perOrderAgg.entries())) {
      opUpsertRows.push({
        user_id: ctx.userId,
        store_id: storeId,
        order_number: order.order_number,
        marketplace_product_id: canonicalId,
        product_name: info.name,
        quantity: info.qty,
      })
    }
  }

  await setProgress(ctx, 40, 'Menyimpan mapping produk')

  const orderNumbers = orders.map((order) => order.order_number)
  const OP_DELETE_CHUNK = 200
  for (let i = 0; i < orderNumbers.length; i += OP_DELETE_CHUNK) {
    const chunk = orderNumbers.slice(i, i + OP_DELETE_CHUNK)
    const { error } = await ctx.supabase
      .from('order_products')
      .delete()
      .eq('store_id', storeId)
      .in('order_number', chunk)
    if (error) {
      console.error('Order.all order_products delete error:', error.message)
      warnings.push(`Gagal refresh mapping produk Order.all: ${error.message}`)
    }
  }

  const OP_CHUNK = 500
  let opInserted = 0
  for (let i = 0; i < opUpsertRows.length; i += OP_CHUNK) {
    const chunk = opUpsertRows.slice(i, i + OP_CHUNK)
    const { error } = await ctx.supabase
      .from('order_products')
      .insert(chunk)
    if (error) {
      console.error('order_products upsert error:', error.message)
      warnings.push(`Sebagian mapping produk gagal disimpan: ${error.message}`)
    } else {
      opInserted += chunk.length
    }
  }
  console.log(`Upserted ${opInserted}/${opUpsertRows.length} order_products rows from Order.all`)
  const resolver = new MasterResolver(masterRowsFromOrdersAll)

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
    const UPDATE_CHUNK = 25
    for (let i = 0; i < incomeOrderNums.length; i += UPDATE_CHUNK) {
      const chunk = incomeOrderNums.slice(i, i + UPDATE_CHUNK)
      const results = await Promise.all(
        chunk.map((orderNum) => {
          const items = orderToProducts.get(orderNum) ?? []
          let estimatedHpp = 0
          for (const item of items) {
            const master = resolver.resolve({ anyId: item.id, productName: item.name })
            if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
              estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
            }
          }
          return ctx.supabase
            .from('orders')
            .update({ estimated_hpp: estimatedHpp })
            .eq('store_id', storeId)
            .eq('order_number', orderNum)
        })
      )
      backfilledCount += results.filter((r) => !r.error).length
    }
    console.log(`Backfilled estimated_hpp for ${backfilledCount} income orders`)
  } catch (backfillError) {
    console.error('Income orders estimated_hpp backfill error:', backfillError)
  }

  await ctx.supabase
    .from('upload_batches')
    .update({ record_count: insertedCount + updatedCount })
    .eq('id', batch.id)

  await setProgress(ctx, 85, 'Sinkronisasi stok keluar (penjualan)')

  try {
    const saleOutResult = await syncSaleOutInventory(ctx.supabase, ctx.userId, storeId)
    if (saleOutResult.transactionsCreated > 0) {
      warnings.push(
        `${saleOutResult.transactionsCreated} transaksi sale_out dicatat (${saleOutResult.ordersProcessed} order Selesai)`
      )
    }
    if (saleOutResult.warnings.length > 0) {
      warnings.push(...saleOutResult.warnings)
    }
  } catch (saleOutError) {
    console.error('Sale-out sync error (non-fatal):', saleOutError)
  }

  await setProgress(ctx, 90, 'Membersihkan produk duplikat')

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
      ...(enrichedCount > 0 ? [`${enrichedCount} master produk numeric diperkaya dengan SKU Seller dari Order.all`] : []),
      ...(createdCount > 0 ? [`${createdCount} master produk baru dibuat (HPP=0, perlu diisi)`] : []),
    ],
    storeId,
  }
}
