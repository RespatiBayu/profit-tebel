import { MARKETPLACE_OPTIONS, type MarketplaceKey } from '@/lib/constants/marketplace-fees'

export const DASHBOARD_FILTER_KEYS = ['store', 'marketplace', 'years', 'months'] as const
export const STORE_STORAGE_KEY = 'profit-tebel:current-store'
export const MARKETPLACE_STORAGE_KEY = 'profit-tebel:current-marketplace'

type SearchParamsLike = Pick<URLSearchParams, 'get'>

const VALID_MARKETPLACES = new Set<MarketplaceKey>(
  MARKETPLACE_OPTIONS.map((option) => option.value)
)

export function normalizeMarketplaceFilter(
  value: string | null | undefined
): MarketplaceKey | null {
  if (!value) return null
  return VALID_MARKETPLACES.has(value as MarketplaceKey) ? (value as MarketplaceKey) : null
}

export function copyDashboardFilters(
  source: SearchParamsLike,
  target = new URLSearchParams()
) {
  for (const key of DASHBOARD_FILTER_KEYS) {
    const value = source.get(key)
    if (value) target.set(key, value)
    else target.delete(key)
  }
  return target
}

export function buildDashboardHref(href: string, searchParams: SearchParamsLike) {
  const url = new URL(href, 'https://profit-tebel.local')
  copyDashboardFilters(searchParams, url.searchParams)
  const query = url.searchParams.toString()
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`
}
