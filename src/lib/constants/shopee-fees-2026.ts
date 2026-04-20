/**
 * Shopee Indonesia fee schedule — estimasi 2026.
 *
 * Biaya admin (komisi) bervariasi berdasarkan tipe toko dan kategori produk.
 * Angka di bawah ini adalah estimasi berdasarkan pola fee Shopee terbaru dan
 * tetap bisa di-override user di UI kalau ada perubahan resmi.
 *
 * Sumber referensi: Shopee Seller Center fee schedule + sheet user.
 */

export type ShopType = 'non_star' | 'star' | 'mall'

export interface ShopTypeInfo {
  value: ShopType
  label: string
  description: string
}

export const SHOP_TYPES: ShopTypeInfo[] = [
  {
    value: 'non_star',
    label: 'Non Star',
    description: 'Toko regular, belum punya badge Star',
  },
  {
    value: 'star',
    label: 'Star / Star+',
    description: 'Toko dengan badge Star atau Star+',
  },
  {
    value: 'mall',
    label: 'Shopee Mall',
    description: 'Toko official brand (Mall)',
  },
]

export interface CategoryInfo {
  value: string
  label: string
}

export const CATEGORIES: CategoryInfo[] = [
  { value: 'fmcg', label: 'FMCG / Groceries' },
  { value: 'beauty', label: 'Kecantikan & Perawatan Diri' },
  { value: 'health', label: 'Kesehatan' },
  { value: 'fashion', label: 'Fashion & Aksesoris' },
  { value: 'electronics', label: 'Elektronik & Gadget' },
  { value: 'home', label: 'Rumah Tangga & Peralatan' },
  { value: 'hobby', label: 'Hobi & Koleksi' },
  { value: 'mom_baby', label: 'Ibu & Bayi' },
  { value: 'books', label: 'Buku & Alat Tulis' },
  { value: 'other', label: 'Lainnya' },
]

/** Admin Fee (komisi) per kombinasi shop type × kategori, estimasi 2026. */
export const ADMIN_FEE_MATRIX: Record<ShopType, Record<string, number>> = {
  non_star: {
    fmcg: 0.045,
    beauty: 0.065,
    health: 0.065,
    fashion: 0.055,
    electronics: 0.0375,
    home: 0.055,
    hobby: 0.055,
    mom_baby: 0.055,
    books: 0.045,
    other: 0.055,
  },
  star: {
    fmcg: 0.0625,
    beauty: 0.0825,
    health: 0.0825,
    fashion: 0.0725,
    electronics: 0.055,
    home: 0.0725,
    hobby: 0.0725,
    mom_baby: 0.0725,
    books: 0.0625,
    other: 0.0725,
  },
  mall: {
    fmcg: 0.075,
    beauty: 0.09,
    health: 0.09,
    fashion: 0.085,
    electronics: 0.065,
    home: 0.085,
    hobby: 0.085,
    mom_baby: 0.085,
    books: 0.075,
    other: 0.085,
  },
}

/** Biaya tetap & biaya program yang umumnya berlaku di semua toko Shopee. */
export const SHOPEE_DEFAULTS_2026 = {
  /** Biaya proses per pesanan (flat). */
  biayaPerPesanan: 1250,
  /** Program Gratis Ongkir Extra (opt-in, dominan di toko aktif). */
  ongkirExtraRate: 0.04,
  /** Program Voucher/Promo Extra (opt-in). */
  promoExtraRate: 0.045,
}

/** Multiplier BEP untuk menghasilkan 3 target ROAS. */
export const ROAS_TARGET_MULTIPLIERS = {
  kompetitif: 1.7,
  konservatif: 2.0,
  prospektif: 4.0,
}

export function getAdminFeeRate(shop: ShopType, category: string): number {
  return ADMIN_FEE_MATRIX[shop][category] ?? ADMIN_FEE_MATRIX[shop].other
}
