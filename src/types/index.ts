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
  recordCount: number
  newProducts: number
  periodStart: string | null
  periodEnd: string | null
  warnings: string[]
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
