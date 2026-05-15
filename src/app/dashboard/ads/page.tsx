import { createClient } from '@/lib/supabase/server'
import {
  buildAvailablePeriods,
  buildPeriodOrFilter,
  parseCsvSelection,
  sanitizeSelection,
} from '@/lib/period-filter'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import AdsDashboard from '@/components/ads/ads-dashboard'
import type { DbAdsRow, DbOrder, DbOrderProduct, MasterProduct } from '@/types'

const ADS_SELECT = [
  'id',
  'upload_batch_id',
  'marketplace',
  'ad_name',
  'parent_iklan',
  'ad_status',
  'product_name',
  'product_code',
  'impressions',
  'clicks',
  'ctr',
  'conversions',
  'direct_conversions',
  'conversion_rate',
  'direct_conversion_rate',
  'cost_per_conversion',
  'cost_per_direct_conversion',
  'units_sold',
  'direct_units_sold',
  'gmv',
  'direct_gmv',
  'ad_spend',
  'roas',
  'direct_roas',
  'acos',
  'direct_acos',
  'voucher_amount',
  'vouchered_sales',
  'report_period_start',
  'report_period_end',
].join(',')

const ORDER_SELECT = [
  'id',
  'upload_batch_id',
  'marketplace',
  'order_number',
  'buyer_username',
  'buyer_name',
  'order_date',
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
  'voucher_code',
  'shipping_type',
  'courier_name',
  'seller_free_shipping_promo',
  'estimated_hpp',
].join(',')

const ORDER_PRODUCT_SELECT = [
  'id',
  'order_number',
  'marketplace_product_id',
  'product_name',
  'processing_fee_prorata',
  'quantity',
].join(',')

const MASTER_PRODUCT_SELECT = [
  'id',
  'marketplace_product_id',
  'product_name',
  'hpp',
  'packaging_cost',
  'marketplace',
  'category',
  'notes',
].join(',')

type UploadPeriodRow = {
  file_type: string
  period_start: string | null
  period_end: string | null
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; years?: string; months?: string }>
}) {
  const { store: storeId, years, months } = await searchParams
  const supabase = await createClient()

  const requestedYears = parseCsvSelection(years)
  const requestedMonths = parseCsvSelection(months)

  const uploadPeriodsQ = supabase
    .from('upload_batches')
    .select('file_type,period_start,period_end')
    .in('file_type', ['ads', 'ads_product'])

  if (storeId) uploadPeriodsQ.eq('store_id', storeId)

  const { data: uploadPeriods } = await uploadPeriodsQ
  const typedUploadPeriods = (uploadPeriods ?? []) as UploadPeriodRow[]
  const availablePeriods = buildAvailablePeriods(
    typedUploadPeriods.map((row) => ({
      period_start: row.period_start,
      period_end: row.period_end,
    }))
  )
  const hasAnyAdsData = typedUploadPeriods.length > 0

  const { selectedPeriods, hasFilter } = sanitizeSelection(
    availablePeriods,
    requestedYears,
    requestedMonths
  )

  async function fetchOrderProducts(orderNumbers: string[]): Promise<DbOrderProduct[]> {
    const uniqueOrderNumbers = Array.from(new Set(orderNumbers))
    if (uniqueOrderNumbers.length === 0) return []

    const rows: DbOrderProduct[] = []
    const chunkSize = 500
    for (let index = 0; index < uniqueOrderNumbers.length; index += chunkSize) {
      const chunk = uniqueOrderNumbers.slice(index, index + chunkSize)
      const query = supabase.from('order_products').select(ORDER_PRODUCT_SELECT)
      if (storeId) query.eq('store_id', storeId)
      const { data } = await query.in('order_number', chunk)
      rows.push(...((data ?? []) as unknown as DbOrderProduct[]))
    }
    return rows
  }

  const masterProductsQ = supabase.from('master_products').select(MASTER_PRODUCT_SELECT)
  if (storeId) masterProductsQ.eq('store_id', storeId)
  const { data: masterProducts } = await masterProductsQ
  const typedProducts = (masterProducts ?? []) as unknown as MasterProduct[]

  let typedAds: DbAdsRow[] = []
  let typedAdsProduct: DbAdsRow[] = []
  let typedOrders: DbOrder[] = []
  let typedOrderProducts: DbOrderProduct[] = []

  const adsFilter = hasFilter ? buildPeriodOrFilter('report_period_start', selectedPeriods) : null
  const orderFilter = hasFilter ? buildPeriodOrFilter('order_date', selectedPeriods) : null
  const canFetchCurrent = !hasFilter || selectedPeriods.length > 0

  if (canFetchCurrent) {
    const summaryQ = supabase
      .from('ads_data')
      .select(ADS_SELECT)
      .not('ad_name', 'is', null)
      .order('ad_spend', { ascending: false })

    const productQ = supabase
      .from('ads_data')
      .select(ADS_SELECT)
      .is('ad_name', null)
      .order('ad_spend', { ascending: false })

    const ordersQ = supabase.from('orders').select(ORDER_SELECT)

    if (storeId) {
      summaryQ.eq('store_id', storeId)
      productQ.eq('store_id', storeId)
      ordersQ.eq('store_id', storeId)
    }

    if (adsFilter) {
      summaryQ.or(adsFilter)
      productQ.or(adsFilter)
    }
    if (orderFilter) ordersQ.or(orderFilter)

    const [
      { data: adsData },
      { data: adsProductData },
      { data: orders },
    ] = await Promise.all([summaryQ, productQ, ordersQ])

    typedAds = (adsData ?? []) as unknown as DbAdsRow[]
    typedAdsProduct = (adsProductData ?? []) as unknown as DbAdsRow[]
    typedOrders = (orders ?? []) as unknown as DbOrder[]
  }

  if (hasFilter) {
    typedOrderProducts = await fetchOrderProducts(typedOrders.map((order) => order.order_number))
  } else {
    const orderProductsQ = supabase.from('order_products').select(ORDER_PRODUCT_SELECT)
    if (storeId) orderProductsQ.eq('store_id', storeId)
    const { data: orderProducts } = await orderProductsQ
    typedOrderProducts = (orderProducts ?? []) as unknown as DbOrderProduct[]
  }

  if (!hasAnyAdsData) {
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
      availablePeriods={availablePeriods}
      hasIncomeData={hasIncomeData}
    />
  )
}
