'use client'

import { useCallback, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ShoppingBag } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MARKETPLACE_OPTIONS } from '@/lib/constants/marketplace-fees'
import {
  MARKETPLACE_STORAGE_KEY,
  normalizeMarketplaceFilter,
} from '@/lib/dashboard-filters'

export function MarketplaceSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentMarketplace = normalizeMarketplaceFilter(searchParams.get('marketplace'))
  const currentOption =
    MARKETPLACE_OPTIONS.find((option) => option.value === currentMarketplace) ?? null

  const selectMarketplace = useCallback(
    (marketplace: string | null) => {
      const params = new URLSearchParams(searchParams.toString())

      if (marketplace) {
        params.set('marketplace', marketplace)
        if (typeof window !== 'undefined') {
          localStorage.setItem(MARKETPLACE_STORAGE_KEY, marketplace)
        }
      } else {
        params.delete('marketplace')
        if (typeof window !== 'undefined') {
          localStorage.removeItem(MARKETPLACE_STORAGE_KEY)
        }
      }

      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
      router.refresh()
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (currentMarketplace || typeof window === 'undefined') return

    const savedMarketplace = normalizeMarketplaceFilter(
      localStorage.getItem(MARKETPLACE_STORAGE_KEY)
    )

    if (savedMarketplace) {
      selectMarketplace(savedMarketplace)
    }
  }, [currentMarketplace, selectMarketplace])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate text-sm font-medium">
          {currentOption?.label ?? 'Semua Platform'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
          Pilih marketplace untuk difilter
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => selectMarketplace(null)} className="gap-2">
          <ShoppingBag className="h-4 w-4" />
          <span className="flex-1">Semua Platform</span>
          {!currentMarketplace && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {MARKETPLACE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => selectMarketplace(option.value)}
            className="gap-2"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="flex-1">{option.label}</span>
            {currentMarketplace === option.value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
