export const MARKETPLACE_FEES = {
  shopee: {
    name: 'Shopee',
    adminFeeRate: 0.0825,
    serviceFeeRate: 0.045,
    processingFee: 1250,
    amsCommissionRate: 0.04,
    estimatedShippingRange: { min: 3500, max: 16500, average: 6500 },
  },
  tiktok: {
    name: 'TikTok Shop',
    adminFeeRate: 0.05,
    serviceFeeRate: 0.02,
    processingFee: 0,
    amsCommissionRate: 0,
    estimatedShippingRange: { min: 5000, max: 15000, average: 8000 },
  },
} as const

export type MarketplaceKey = keyof typeof MARKETPLACE_FEES

export const ROAS_THRESHOLDS = {
  scale: 3.0,
  optimize: 1.5,
  kill: 1.5,
  minConversions: 5,
} as const

export const MARKETPLACE_OPTIONS = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'tiktok', label: 'TikTok Shop' },
] as const
