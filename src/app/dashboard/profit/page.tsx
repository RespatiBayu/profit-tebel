import { createClient } from '@/lib/supabase/server'
import {
  buildAvailablePeriods,
  buildPeriodOrFilter,
  parseCsvSelection,
  sanitizeSelection,
  shiftYearMonth,
} from '@/lib/period-filter'
import { Button } from '@/components/ui/button'
import { DashboardLink } from '@/components/layout/dashboard-link'
import { Upload } from 'lucide-react'
import ProfitDashboard from '@/components/profit/profit-dashboard'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'
import type { DbAdsRow, DbOrder, DbOrderAll, DbOrderProduct, MasterProduct } from '@/types'

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

const ORDERS_ALL_SELECT = [
  'id',
  'store_id',
  'upload_batch_id',
  'marketplace',
  'order_number',
  'status_pesanan',
  'total_pembayaran',
  'seller_voucher',
  'order_date',
  'order_complete_date',
  'products_json',
  'estimated_hpp',
].join(',')

type UploadPeriodRow = {
  file_type: string
  period_start: string | null
  period_end: string | null
}

function formatPeriodLabel(periods: string[]): string | null {
  const uniquePeriods = Array.from(new Set(periods)).sort()
  if (uniquePeriods.length === 0) return null

  const formatMonth = (period: string) => {
    const [year, month] = period.split('-')
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toLocaleDateString('id-ID', {
      month: 'short',
      year: 'numeric',
    })
  }

  if (uniquePeriods.length === 1) return formatMonth(uniquePeriods[0])
  return `${formatMonth(uniquePeriods[0])} – ${formatMonth(uniquePeriods[uniquePeriods.length - 1])}`
}

function mergeOrdersAll(current: DbOrderAll[], previous: DbOrderAll[]): DbOrderAll[] {
  const merged = new Map<string, DbOrderAll>()
  for (const row of [...previous, ...current]) {
    merged.set(row.order_number, row)
  }
  return Array.from(merged.values())
}

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; marketplace?: string; years?: string; months?: string }>
}) {
  const {
    store: storeId,
    marketplace: marketplaceParam,
    years,
    months,
  } = await searchParams
  const marketplace = normalizeMarketplaceFilter(marketplaceParam)
  const supabase = await createClient()

  const requestedYears = parseCsvSelection(years)
  const requestedMonths = parseCsvSelection(months)

  const uploadPeriodsQ = supabase
    .from('upload_batches')
    .select('file_type,period_start,period_end')
    .in('file_type', ['income', 'ads', 'ads_product'])

  if (storeId) uploadPeriodsQ.eq('store_id', storeId)
  if (marketplace) uploadPeriodsQ.eq('marketplace', marketplace)

  const { data: uploadPeriods } = await uploadPeriodsQ
  const typedUploadPeriods = (uploadPeriods ?? []) as UploadPeriodRow[]
  const availablePeriods = buildAvailablePeriods(
    typedUploadPeriods.map((row) => ({
      period_start: row.period_start,
      period_end: row.period_end,
    }))
  )
  const hasAnyIncomeData = typedUploadPeriods.some((row) => row.file_type === 'income')

  const { selectedPeriods, hasFilter } = sanitizeSelection(
    availablePeriods,
    requestedYears,
    requestedMonths
  )
  const previousPeriods = hasFilter
    ? Array.from(new Set(selectedPeriods.map((period) => shiftYearMonth(period, -1)))).sort()
    : []

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
  if (marketplace) masterProductsQ.eq('marketplace', marketplace)
  const { data: masterProducts } = await masterProductsQ
  const typedMasterProducts = (masterProducts ?? []) as unknown as MasterProduct[]

  let typedOrders: DbOrder[] = []
  let typedAdsData: DbAdsRow[] = []
  let typedOrdersAll: DbOrderAll[] = []
  let prevOrders: DbOrder[] = []
  let prevAdsData: DbAdsRow[] = []
  let prevOrdersAll: DbOrderAll[] = []
  let typedOrderProducts: DbOrderProduct[] = []

  const currentOrderFilter = hasFilter ? buildPeriodOrFilter('order_date', selectedPeriods) : null
  const currentAdsFilter = hasFilter ? buildPeriodOrFilter('report_period_start', selectedPeriods) : null
  const previousOrderFilter = hasFilter ? buildPeriodOrFilter('order_date', previousPeriods) : null
  const previousAdsFilter = hasFilter ? buildPeriodOrFilter('report_period_start', previousPeriods) : null

  const canFetchCurrent = !hasFilter || selectedPeriods.length > 0
  if (canFetchCurrent) {
    const ordersQ = supabase.from('orders').select(ORDER_SELECT).order('order_date', { ascending: false })
    const adsQ = supabase.from('ads_data').select(ADS_SELECT)
    const ordersAllQ = supabase.from('orders_all').select(ORDERS_ALL_SELECT)

    if (storeId) {
      ordersQ.eq('store_id', storeId)
      adsQ.eq('store_id', storeId)
      ordersAllQ.eq('store_id', storeId)
    }
    if (marketplace) {
      ordersQ.eq('marketplace', marketplace)
      adsQ.eq('marketplace', marketplace)
      ordersAllQ.eq('marketplace', marketplace)
    }

    if (currentOrderFilter) {
      ordersQ.or(currentOrderFilter)
      ordersAllQ.or(currentOrderFilter)
    }
    if (currentAdsFilter) adsQ.or(currentAdsFilter)

    const [
      { data: orders },
      { data: adsData },
      { data: ordersAll },
    ] = await Promise.all([ordersQ, adsQ, ordersAllQ])

    typedOrders = (orders ?? []) as unknown as DbOrder[]
    typedAdsData = (adsData ?? []) as unknown as DbAdsRow[]
    typedOrdersAll = (ordersAll ?? []) as unknown as DbOrderAll[]

    if (hasFilter && previousPeriods.length > 0) {
      const prevOrdersQ = supabase.from('orders').select(ORDER_SELECT)
      const prevAdsQ = supabase.from('ads_data').select(ADS_SELECT)
      const prevOrdersAllQ = supabase.from('orders_all').select(ORDERS_ALL_SELECT)

      if (storeId) {
        prevOrdersQ.eq('store_id', storeId)
        prevAdsQ.eq('store_id', storeId)
        prevOrdersAllQ.eq('store_id', storeId)
      }
      if (marketplace) {
        prevOrdersQ.eq('marketplace', marketplace)
        prevAdsQ.eq('marketplace', marketplace)
        prevOrdersAllQ.eq('marketplace', marketplace)
      }

      if (previousOrderFilter) {
        prevOrdersQ.or(previousOrderFilter)
        prevOrdersAllQ.or(previousOrderFilter)
      }
      if (previousAdsFilter) prevAdsQ.or(previousAdsFilter)

      const [
        { data: previousOrdersData },
        { data: previousAdsData },
        { data: previousOrdersAllData },
      ] = await Promise.all([prevOrdersQ, prevAdsQ, prevOrdersAllQ])

      prevOrders = (previousOrdersData ?? []) as unknown as DbOrder[]
      prevAdsData = (previousAdsData ?? []) as unknown as DbAdsRow[]
      prevOrdersAll = (previousOrdersAllData ?? []) as unknown as DbOrderAll[]
    }
  }

  if (hasFilter || marketplace) {
    typedOrderProducts = await fetchOrderProducts([
      ...typedOrders.map((order) => order.order_number),
      ...prevOrders.map((order) => order.order_number),
    ])
  } else {
    const orderProductsQ = supabase.from('order_products').select(ORDER_PRODUCT_SELECT)
    if (storeId) orderProductsQ.eq('store_id', storeId)
    const { data: orderProducts } = await orderProductsQ
    typedOrderProducts = (orderProducts ?? []) as unknown as DbOrderProduct[]
  }

  if (!hasAnyIncomeData) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Upload className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Belum ada data penghasilan</h1>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Upload file XLSX income dari Shopee Seller Center untuk mulai analisis profit.
          </p>
        </div>
        <div className="flex gap-3">
          <DashboardLink href="/dashboard/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data
            </Button>
          </DashboardLink>
        </div>
      </div>
    )
  }

  const noHppCount = typedMasterProducts.filter((product) => !product.hpp || product.hpp === 0).length

  return (
    <ProfitDashboard
      orders={typedOrders}
      prevOrders={hasFilter ? prevOrders : undefined}
      orderProducts={typedOrderProducts}
      masterProducts={typedMasterProducts}
      adsData={typedAdsData}
      prevAdsData={hasFilter ? prevAdsData : undefined}
      ordersAll={typedOrdersAll}
      hppOrdersAll={hasFilter ? mergeOrdersAll(typedOrdersAll, prevOrdersAll) : undefined}
      availablePeriods={availablePeriods}
      comparisonLabel={hasFilter ? formatPeriodLabel(previousPeriods) : undefined}
      useServerComparison={hasFilter}
      noHppCount={noHppCount}
    />
  )
}
