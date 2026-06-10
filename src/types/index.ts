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

export type UploadFileType = 'income' | 'ads' | 'ads_product' | 'orders_all'

export type UploadJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type MasterProductSourceTag = 'income' | 'orders_all' | 'ads' | 'ads_product'

export interface UploadJobResult extends UploadSummary {
  storeId?: string | null
  opfRowsTotal?: number
  opfMatched?: number
  opfUnmatched?: number
  orderProductsCreated?: number
  opfUnmatchedSamples?: Array<{ id: string | null; name: string | null }>
}

export interface UploadJobStatusResponse {
  id: string
  status: UploadJobStatus
  progress: number
  progressLabel: string | null
  fileType: UploadFileType
  fileName: string
  result: UploadJobResult | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type AppUserRole = 'superadmin' | 'member'

// ============================================================
// SUBSCRIPTION
// ============================================================
export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'monthly' | 'lifetime' | null

// Tier efektif: 'basic' (analitik + Master Item) atau 'pro' (full inventory).
export type SubscriptionTier = 'basic' | 'pro' | null

export interface SubscriptionStatus {
  plan: SubscriptionPlan
  tier: SubscriptionTier
  isActive: boolean          // akun aktif (boleh upload data) — basic/pro/trial aktif
  isTrial: boolean           // sedang masa free trial Basic
  isReadOnly: boolean        // akses habis → analitik read-only, upload diblokir
  hasProInventory: boolean   // akses modul Pro (Formula/PO/Produksi/Stok/Opname)
  expiresAt: string | null   // ISO string masa aktif berbayar
  daysRemaining: number | null  // sisa hari berbayar; negatif = expired
  trialEndsAt: string | null
  trialDaysRemaining: number | null
}

export type StoreAccessRole = 'owner' | 'member'

// ============================================================
// INVENTORY — Master Items
// ============================================================
export type ItemType = 'raw_material' | 'semi_finished' | 'finished_good'

export interface Item {
  id: string
  user_id: string
  store_id: string | null
  name: string
  sku: string | null
  type: ItemType
  unit: string               // pcs, kg, gram, liter, ml, lusin, dll
  cost_per_unit: number      // harga manual / fallback
  packaging_cost: number     // biaya packaging per unit (barang jadi), 0 = tidak diset
  min_stock_qty: number      // batas stok minimum, 0 = tidak diset
  notes: string | null
  created_at: string
  updated_at: string
  // Computed from item_stock view (joined on demand)
  qty_on_hand?: number
  avg_cost?: number | null
}

// ============================================================
// INVENTORY — Bill of Materials (BOM)
// ============================================================
export interface BomLine {
  id: string
  bom_id: string
  input_item_id: string
  qty_per_output: number
  sort_order: number
  notes: string | null
  // Joined
  input_item?: Item
}

export interface BomHeader {
  id: string
  user_id: string
  store_id: string | null
  output_item_id: string
  output_qty: number
  name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  output_item?: Item
  lines?: BomLine[]
  // Computed
  hpp_per_unit?: number | null  // kalkulasi rekursif dari lines
}

// ============================================================
// INVENTORY — Purchase Orders
// ============================================================
export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled'

export interface PurchaseOrderLine {
  id: string
  po_id: string
  item_id: string
  qty_ordered: number
  qty_received: number
  unit_cost: number
  // Computed
  total_cost?: number
  // Joined
  item?: Item
}

export interface PurchaseOrder {
  id: string
  user_id: string
  store_id: string | null
  po_number: string | null
  date: string               // ISO date
  supplier: string | null
  status: PurchaseOrderStatus
  notes: string | null
  total_amount: number
  created_at: string
  updated_at: string
  lines?: PurchaseOrderLine[]
}

// ============================================================
// INVENTORY — Transactions & Stock
// ============================================================
export type InventoryTransactionType =
  | 'purchase_in'
  | 'production_in'
  | 'production_out'
  | 'sale_out'
  | 'adjustment'

export interface InventoryTransaction {
  id: string
  user_id: string
  store_id: string | null
  item_id: string
  transaction_type: InventoryTransactionType
  reference_id: string | null
  reference_type: string | null
  qty: number                // positif = masuk, negatif = keluar
  unit_cost: number | null
  date: string               // ISO date
  notes: string | null
  created_at: string
  // Joined
  item?: Item
}

export interface ItemStock {
  user_id: string
  store_id: string | null
  item_id: string
  qty_on_hand: number
  avg_cost: number | null
  last_transaction_date: string | null
  transaction_count: number
}

// ============================================================
// INVENTORY — Stock Opname
// ============================================================
export type StockOpnameStatus = 'draft' | 'finalized'

export interface StockOpnameLine {
  id: string
  session_id: string
  item_id: string
  system_qty: number
  actual_qty: number | null
  notes: string | null
  // Joined
  item?: Pick<Item, 'id' | 'name' | 'unit' | 'type' | 'sku'>
}

export interface StockOpnameSession {
  id: string
  user_id: string
  store_id: string | null
  name: string
  status: StockOpnameStatus
  date: string
  notes: string | null
  finalized_at: string | null
  created_at: string
  updated_at: string
  // Joined
  lines?: StockOpnameLine[]
}

// ============================================================
// INVENTORY — Production Orders
// ============================================================
export type ProductionOrderStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled'

export interface ProductionOrderLine {
  id: string
  production_order_id: string
  item_id: string
  planned_qty: number
  actual_qty: number | null
  unit_cost_snapshot: number | null
  // Joined
  item?: Item
  // Enriched from item_stock
  avg_cost?: number | null
}

export interface ProductionOrder {
  id: string
  user_id: string
  store_id: string | null
  bom_id: string
  po_number: string | null
  status: ProductionOrderStatus
  planned_qty: number
  actual_qty: number | null
  date: string               // ISO date
  notes: string | null
  total_material_cost: number | null
  hpp_per_unit: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
  // Joined
  bom?: BomHeader
  lines?: ProductionOrderLine[]
}

export interface AvailablePeriods {
  years: string[]
  monthsByYear: Record<string, string[]>
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
  access_role?: StoreAccessRole
  can_manage?: boolean
}

// Master product (from DB)
export interface MasterProduct {
  id: string
  marketplace_product_id: string
  seller_sku: string | null
  source_tags?: MasterProductSourceTag[]
  product_name: string
  hpp: number
  packaging_cost: number
  marketplace: string
  category: string | null
  notes: string | null
  has_income_data?: boolean
  has_ads_data?: boolean
  linked_item_id?: string | null
  linked_item_name?: string | null   // joined display name
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

// Biaya Operasional (listrik, sewa, gaji, dll) — per periode bulanan
export type OperatingCostCategory =
  | 'utilities'   // Listrik, air
  | 'rent'        // Sewa tempat
  | 'salary'      // Gaji karyawan
  | 'internet'    // Internet, pulsa
  | 'marketing'   // Marketing di luar iklan marketplace
  | 'transport'   // Transport, bensin
  | 'supplies'    // Perlengkapan, ATK
  | 'other'       // Lainnya

export interface OperatingCost {
  id: string
  user_id: string
  store_id: string | null
  name: string
  category: OperatingCostCategory
  amount: number
  cost_date: string | null   // tanggal biaya dikeluarkan (YYYY-MM-DD)
  period_year: number
  period_month: number
  notes: string | null
  created_at: string
  updated_at: string
}

// Calculated profit results
export interface ProfitKpis {
  totalOmzet: number
  totalProductDiscount: number  // "harga coret" (Diskon Produk) — gimmick, info saja
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
  /** Real ROAS = (GMV × 0.89 − total HPP cost) / Ad Spend
   *  Memperhitungkan PPN 11% dari GMV + HPP. null kalau HPP belum diisi. */
  realRoas: number | null
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
