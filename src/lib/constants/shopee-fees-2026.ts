/**
 * Fee schedule marketplace Indonesia — estimasi 2026.
 *
 * Mendukung 2 platform:
 *  - Shopee: Non Star / Star–Star+ / Shopee Mall
 *  - TikTok Shop: Regular / TikTok Shop Mall
 *
 * Semua angka bisa di-override user di UI kalau ada update dari marketplace.
 */

export type Platform = 'shopee' | 'tiktok'

export type ShopType =
  | 'non_star'
  | 'star'
  | 'mall'
  | 'tiktok_regular'
  | 'tiktok_mall'

export interface ShopTypeInfo {
  value: ShopType
  label: string
  description: string
}

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

interface PlatformConfig {
  label: string
  shopTypes: ShopTypeInfo[]
  adminFeeMatrix: Record<string, Record<string, number>>
  defaults: {
    biayaPerPesanan: number
    ongkirExtraRate: number
    promoExtraRate: number
  }
  labels: {
    adminFee: string
    ongkirExtra: string
    promoExtra: string
  }
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  shopee: {
    label: 'Shopee',
    shopTypes: [
      { value: 'non_star', label: 'Non Star', description: 'Toko regular, belum punya badge Star' },
      { value: 'star', label: 'Star / Star+', description: 'Toko dengan badge Star atau Star+' },
      { value: 'mall', label: 'Shopee Mall', description: 'Toko official brand (Mall)' },
    ],
    adminFeeMatrix: {
      non_star: {
        fmcg: 0.045, beauty: 0.065, health: 0.065, fashion: 0.055,
        electronics: 0.0375, home: 0.055, hobby: 0.055, mom_baby: 0.055,
        books: 0.045, other: 0.055,
      },
      star: {
        fmcg: 0.0625, beauty: 0.0825, health: 0.0825, fashion: 0.0725,
        electronics: 0.055, home: 0.0725, hobby: 0.0725, mom_baby: 0.0725,
        books: 0.0625, other: 0.0725,
      },
      mall: {
        fmcg: 0.075, beauty: 0.09, health: 0.09, fashion: 0.085,
        electronics: 0.065, home: 0.085, hobby: 0.085, mom_baby: 0.085,
        books: 0.075, other: 0.085,
      },
    },
    defaults: {
      biayaPerPesanan: 1250,
      ongkirExtraRate: 0.04,
      promoExtraRate: 0.045,
    },
    labels: {
      adminFee: 'Biaya Admin',
      ongkirExtra: 'Gratis Ongkir XTRA',
      promoExtra: 'Cashback XTRA',
    },
  },
  tiktok: {
    label: 'TikTok Shop',
    shopTypes: [
      { value: 'tiktok_regular', label: 'Regular', description: 'Toko regular TikTok Shop' },
      { value: 'tiktok_mall', label: 'TikTok Shop Mall', description: 'Toko Mall (official brand) TikTok' },
    ],
    adminFeeMatrix: {
      tiktok_regular: {
        fmcg: 0.02, beauty: 0.035, health: 0.035, fashion: 0.03,
        electronics: 0.02, home: 0.025, hobby: 0.03, mom_baby: 0.03,
        books: 0.02, other: 0.03,
      },
      tiktok_mall: {
        fmcg: 0.04, beauty: 0.06, health: 0.06, fashion: 0.05,
        electronics: 0.04, home: 0.05, hobby: 0.05, mom_baby: 0.05,
        books: 0.04, other: 0.05,
      },
    },
    defaults: {
      biayaPerPesanan: 0,
      ongkirExtraRate: 0.03,
      promoExtraRate: 0.05,
    },
    labels: {
      adminFee: 'Commission Fee',
      ongkirExtra: 'Free Shipping Program',
      promoExtra: 'Affiliate / Promo',
    },
  },
}

/** Multiplier BEP untuk menghasilkan 3 target ROAS. */
export const ROAS_TARGET_MULTIPLIERS = {
  kompetitif: 1.7,
  konservatif: 2.0,
  prospektif: 4.0,
}

export function getAdminFeeRate(platform: Platform, shop: ShopType, category: string): number {
  const matrix = PLATFORMS[platform].adminFeeMatrix
  return matrix[shop]?.[category] ?? matrix[shop]?.other ?? 0
}
