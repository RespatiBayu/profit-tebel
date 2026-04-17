import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import AdsDashboard from '@/components/ads/ads-dashboard'
import type { DbAdsRow, DbOrder, DbOrderProduct, MasterProduct } from '@/types'

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>
}) {
  const { store: storeId } = await searchParams
  const supabase = await createClient()

  const mpQ = supabase.from('master_products').select('*')
  const ordQ = supabase.from('orders').select('*')
  const opQ = supabase.from('order_products').select('*')
  if (storeId) {
    mpQ.eq('store_id', storeId)
    ordQ.eq('store_id', storeId)
    opQ.eq('store_id', storeId)
  }

  // Fetch batch IDs for each ads type separately
  const [{ data: summaryBatchData }, { data: productBatchData }] = await Promise.all([
    storeId
      ? supabase.from('upload_batches').select('id').eq('file_type', 'ads').eq('store_id', storeId)
      : supabase.from('upload_batches').select('id').eq('file_type', 'ads'),
    storeId
      ? supabase.from('upload_batches').select('id').eq('file_type', 'ads_product').eq('store_id', storeId)
      : supabase.from('upload_batches').select('id').eq('file_type', 'ads_product'),
  ])

  const summaryBatchIds = (summaryBatchData ?? []).map((b) => b.id)
  const productBatchIds = (productBatchData ?? []).map((b) => b.id)

  // Build separate queries for summary and product ads data
  const summaryQ = supabase.from('ads_data').select('*').order('ad_spend', { ascending: false })
  const productQ = supabase.from('ads_data').select('*').order('ad_spend', { ascending: false })

  if (summaryBatchIds.length > 0) {
    summaryQ.in('upload_batch_id', summaryBatchIds)
  } else {
    summaryQ.eq('upload_batch_id', 'no-match') // return empty
  }

  if (productBatchIds.length > 0) {
    productQ.in('upload_batch_id', productBatchIds)
  } else {
    productQ.eq('upload_batch_id', 'no-match') // return empty
  }

  const [
    { data: adsData },
    { data: adsProductData },
    { data: masterProducts },
    { data: orders },
    { data: orderProducts },
  ] = await Promise.all([summaryQ, productQ, mpQ, ordQ, opQ])

  const typedAds = (adsData ?? []) as DbAdsRow[]
  const typedAdsProduct = (adsProductData ?? []) as DbAdsRow[]
  const typedProducts = (masterProducts ?? []) as MasterProduct[]
  const typedOrders = (orders ?? []) as DbOrder[]
  const typedOrderProducts = (orderProducts ?? []) as DbOrderProduct[]

  // Filter out aggregate row for display count
  const productAds = typedAds.filter((r) => r.product_code !== '-')

  if (productAds.length === 0 && typedAdsProduct.filter((r) => r.product_code !== '-').length === 0) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
          <Upload className="h-8 w-8 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Belum ada data iklan</h1>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Upload file CSV iklan dari Shopee Ads untuk melihat analisis ROAS dan
            rekomendasi SCALE / OPTIMIZE / KILL.
          </p>
        </div>
        <Link href="/dashboard/upload">
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Data Iklan
          </Button>
        </Link>
      </div>
    )
  }

  const hasIncomeData = typedOrders.length > 0

  return (
    <AdsDashboard
      adsData={typedAds}
      adsProductData={typedAdsProduct}
      masterProducts={typedProducts}
      orders={typedOrders}
      orderProducts={typedOrderProducts}
      hasIncomeData={hasIncomeData}
    />
  )
}
