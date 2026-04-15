// Parsed order from Shopee Income XLSX
export interface ParsedOrder {
  order_number: string
  order_date: string | null       // ISO 8601 date string
  release_date: string | null
  payment_method: string | null
  original_price: number
  product_discount: number
  refund_amount: number
  seller_voucher: number
  seller_voucher_cofund: number
  seller_cashback: number
  buyer_shipping_fee: number
  shopee_shipping_subsidy: number
  actual_shipping_cost: number
  return_shipping_cost: number
  ams_commission: number
  admin_fee: number
  service_fee: number
  processing_fee: number
  premium_fee: number
  shipping_program_fee: number
  transaction_fee: number
  campaign_fee: number
  total_income: number
  voucher_code: string | null
  shipping_type: string | null
  courier_name: string | null
  seller_free_shipping_promo: number
}

// Parsed product mapping from Order Processing Fee sheet
export interface ParsedOrderProduct {
  order_number: string
  marketplace_product_id: string
  product_name: string | null
  processing_fee_prorata: number
}

// Parsed Shopee Ads row from CSV
export interface ParsedAdsRow {
  product_name: string | null
  product_code: string
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  direct_conversions: number
  conversion_rate: number
  direct_conversion_rate: number
  cost_per_conversion: number
  cost_per_direct_conversion: number
  units_sold: number
  direct_units_sold: number
  gmv: number
  direct_gmv: number
  ad_spend: number
  roas: number
  direct_roas: number
  acos: number
  direct_acos: number
  voucher_amount: number
  vouchered_sales: number
}

// Result of parsing Income XLSX
export interface IncomeParseResult {
  orders: ParsedOrder[]
  orderProducts: ParsedOrderProduct[]
  periodStart: string | null
  periodEnd: string | null
}

// Result of parsing Ads CSV
export interface AdsParseResult {
  rows: ParsedAdsRow[]
  shopAggregate: ParsedAdsRow | null   // "Shop GMV Max" row
  periodStart: string | null
  periodEnd: string | null
}

// Upload batch summary returned to client
export interface UploadSummary {
  batchId: string
  recordCount: number         // total rows parsed from file
  insertedCount: number       // actually saved as new (after dedup)
  duplicateCount: number      // skipped because already existed
  newProducts: number
  periodStart: string | null
  periodEnd: string | null
  warnings: string[]
}

// Store (per-user workspace for a specific shop)
export interface Store {
  id: string
  user_id: string
  name: string
  marketplace: string
  color: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Master product (from DB)
export interface MasterProduct {
  id: string
  marketplace_product_id: string
  product_name: string
  hpp: number
  packaging_cost: number
  marketplace: string
  category: string | null
  notes: string | null
  has_income_data?: boolean
  has_ads_data?: boolean
}

// DB row from `orders` table (what Supabase returns)
export interface DbOrder {
  id: string
  upload_batch_id: string
  marketplace: string
  order_number: string
  order_date: string | null
  release_date: string | null
  payment_method: string | null
  original_price: number
  product_discount: number
  refund_amount: number
  seller_voucher: number
  seller_voucher_cofund: number
  seller_cashback: number
  buyer_shipping_fee: number
  shopee_shipping_subsidy: number
  actual_shipping_cost: number
  return_shipping_cost: number
  ams_commission: number
  admin_fee: number
  service_fee: number
  processing_fee: number
  premium_fee: number
  shipping_program_fee: number
  transaction_fee: number
  campaign_fee: number
  total_income: number
  voucher_code: string | null
  shipping_type: string | null
  courier_name: string | null
  seller_free_shipping_promo: number
}

// DB row from `order_products` table
export interface DbOrderProduct {
  id: string
  order_number: string
  marketplace_product_id: string
  product_name: string | null
  processing_fee_prorata: number
}

// Calculated profit results
export interface ProfitKpis {
  totalOmzet: number
  totalNetIncome: number
  totalFees: number
  totalHppCost: number
  realProfit: number
  profitMargin: number | null  // null if no HPP data
  orderCount: number
  hasHppData: boolean
}

export interface FeeBreakdownItem {
  name: string
  value: number
  color: string
}

export interface TrendPoint {
  date: string
  omzet: number
  netIncome: number
  profit: number | null
}

export interface ProductProfitRow {
  productId: string
  productName: string
  orderCount: number
  attributedIncome: number
  totalHppCost: number
  profit: number
  margin: number | null
  hasHpp: boolean
}

export interface PaymentDistItem {
  method: string
  count: number
  amount: number
}

export interface CourierStatRow {
  courier: string
  orderCount: number
  totalShippingCost: number
  avgShippingCost: number
}

export interface CashFlowStats {
  avgDays: number
  minDays: number
  maxDays: number
  ordersWithBothDates: number
}

// DB row from `ads_data` table
export interface DbAdsRow {
  id: string
  upload_batch_id: string
  marketplace: string
  product_name: string | null
  product_code: string
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  direct_conversions: number
  conversion_rate: number
  direct_conversion_rate: number
  cost_per_conversion: number
  cost_per_direct_conversion: number
  units_sold: number
  direct_units_sold: number
  gmv: number
  direct_gmv: number
  ad_spend: number
  roas: number
  direct_roas: number
  acos: number
  direct_acos: number
  voucher_amount: number
  vouchered_sales: number
  report_period_start: string | null
  report_period_end: string | null
}

// Ads calculation results
export type TrafficLight = 'scale' | 'optimize' | 'kill'

export interface AdsKpis {
  totalAdSpend: number
  totalGmv: number
  overallRoas: number
  totalConversions: number
  avgCpa: number
  productCount: number
  scaleCount: number
  optimizeCount: number
  killCount: number
}

export interface TrafficLightRow {
  productCode: string
  productName: string
  impressions: number
  clicks: number
  conversions: number
  unitsSold: number
  gmv: number
  adSpend: number
  roas: number
  directRoas: number
  cpa: number
  ctr: number
  conversionRate: number
  signal: TrafficLight
  trueRoas: number | null   // ROAS adjusted for HPP
  profitPerUnit: number | null
}

export interface FunnelRow {
  productName: string
  productCode: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  conversionRate: number
}

export interface QuadrantPoint {
  productCode: string
  productName: string
  roas: number
  profitPerUnit: number
  adSpend: number   // bubble size
  signal: TrafficLight
}
