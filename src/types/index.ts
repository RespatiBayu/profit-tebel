// Parsed order from Shopee Income XLSX
export interface ParsedOrder {
  order_number: string
  buyer_username: string | null   // Shopee username of buyer
  buyer_name: string | null       // Nama Penerima (recipient name)
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
  ad_name: string | null        // "Nama Iklan" from Format 1 (null for Format 2)
  parent_iklan: string | null   // "Parent Iklan" from Format 2 (null for Format 1)
  ad_status: string | null      // "Status" from Format 1: Berjalan | Dijeda | Berakhir
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
  parentIklan: string | null           // Format 2 only: "Parent Iklan" metadata value
}

// Upload batch summary returned to client
export interface UploadSummary {
  batchId: string
  recordCount: number         // total rows parsed from file
  insertedCount: number       // saved as new rows
  updatedCount?: number       // rows yang sudah ada tapi values-nya berubah → di-overwrite ke versi terbaru
  unchangedCount?: number     // rows yang sudah ada & values identik → skip (no-op)
  duplicateCount: number      // legacy alias: kompatibel sama UI lama (= unchangedCount)
  newProducts: number
  periodStart: string | null
  periodEnd: string | null
  warnings: string[]
}

export type StoreAccessRole = 'owner' | 'member'

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
  access_role?: StoreAccessRole
  can_manage?: boolean
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
  buyer_username: string | null
  buyer_name: string | null
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
  /** Pre-computed HPP estimate (migration 013). 0 if no HPP found at upload time. */
  estimated_hpp: number | null
}

// DB row from `order_products` table
export interface DbOrderProduct {
  id: string
  order_number: string
  marketplace_product_id: string
  product_name: string | null
  processing_fee_prorata: number
  /** Quantity from Order.all per-SKU rows (migration 014). Defaults to 1 for legacy income-OPF rows. */
  quantity: number
}

// Calculated profit results
export interface ProfitKpis {
  totalOmzet: number
  totalDiskonPromo: number
  grossIncome: number
  totalNetIncome: number
  totalFees: number
  totalHppCost: number
  totalAdSpend: number
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

/** Satu baris pengurang dari Total Omzet (Harga Asli Produk) ke Net Income
 *  (Total Penghasilan Shopee). Value selalu positif magnitude.
 *  `group` dipakai untuk sub-heading di UI.  */
export interface OmzetDeductionItem {
  name: string
  value: number
  color: string
  group: 'discount' | 'marketplace_fee' | 'shipping' | 'other'
  /** Optional hint keterangan (contoh: "kamu tanggung sendiri") */
  hint?: string
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
  totalAdSpend: number
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

// DB row from `orders_all` table (Shopee Order.all export)
export interface DbOrderAll {
  id: string
  store_id: string
  upload_batch_id: string
  marketplace: string
  order_number: string
  status_pesanan: string | null  // Selesai | Batal | Telah Dikirim | Sedang Dikirim | Perlu Dikirim | Belum Bayar
  total_pembayaran: number       // Estimated seller payout after Shopee fees
  seller_voucher: number | null  // Voucher Ditanggung Penjual + Paket Diskon Penjual (order-level)
  order_date: string | null
  order_complete_date: string | null
  /** Per-SKU breakdown for KPI estimation. Null on old rows uploaded before migration 010. */
  products_json: Array<{
    marketplace_product_id: string | null
    product_name: string | null
    quantity: number
    harga_awal: number             // original price per unit → for omzet calc
    harga_setelah_diskon: number   // price after product discount → for diskon calc
  }> | null
  /** Pre-computed HPP estimate (migration 012). 0 if no HPP found at upload time. */
  estimated_hpp: number | null
}

// Summary of pending orders from orders_all
export interface PendingSummary {
  totalPending: number       // sum total_pembayaran for non-Selesai & non-Batal
  countPending: number       // number of pending orders
  byStatus: {
    status: string
    count: number
    total: number
  }[]
  // Reconciliation fields
  totalSelesai: number       // sum total_pembayaran for Selesai orders
  countSelesai: number
  matchedWithIncome: number  // orders appearing in both orders_all & income file
}

// DB row from `ads_data` table
export interface DbAdsRow {
  id: string
  upload_batch_id: string
  marketplace: string
  ad_name: string | null        // "Nama Iklan" from Format 1 (null for Format 2)
  parent_iklan: string | null   // "Parent Iklan" from Format 2 (null for Format 1)
  ad_status: string | null      // Format 1: Berjalan | Dijeda | Berakhir
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
  adName: string | null          // "Nama Iklan" from Format 1 — campaign identifier
  adStatus: string | null        // Status iklan: Berjalan | Dijeda | Berakhir | null (Format 2)
  productCode: string
  productName: string
  reportPeriodStart: string | null
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
  signal: TrafficLight | 'neutral'  // 'neutral' = can't classify (no HPP / no BEP)
  trueRoas: number | null   // ROAS adjusted for HPP (deprecated in UI, kept for back-compat)
  profitPerUnit: number | null
  /** BEP ROAS — titik impas berdasarkan HPP + fee preset marketplace.
   *  Formula: harga jual / (harga jual − HPP − total fee). null kalau HPP/units nggak cukup. */
  bepRoas: number | null
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
