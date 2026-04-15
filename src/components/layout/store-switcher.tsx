'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Store as StoreIcon, ChevronDown, Plus, Check, Layers, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import type { Store } from '@/types'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'profit-tebel:current-store'

export function StoreSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  const currentStoreId = searchParams.get('store') ?? ''
  const currentStore = stores.find((s) => s.id === currentStoreId) ?? null

  useEffect(() => {
    let mounted = true
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        setStores(data.stores ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { mounted = false }
  }, [])

  // On first load, read last-selected store from localStorage and apply if no URL param
  useEffect(() => {
    if (!currentStoreId && typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && stores.some((s) => s.id === saved)) {
        selectStore(saved)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores])

  function selectStore(storeId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (storeId) {
      params.set('store', storeId)
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, storeId)
    } else {
      params.delete('store')
      if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    router.refresh()
  }

  const label = currentStore
    ? currentStore.name
    : stores.length === 0
    ? 'Belum ada toko'
    : 'Semua Toko'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {currentStore ? (
          <StoreIcon className="h-4 w-4 text-primary" />
        ) : (
          <Layers className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium max-w-[140px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Pilih toko untuk difilter
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => selectStore(null)} className="gap-2">
          <Layers className="h-4 w-4" />
          <span className="flex-1">Semua Toko (Konsolidasi)</span>
          {!currentStoreId && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        {loading && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Memuat...</div>
        )}

        {!loading && stores.length > 0 && <DropdownMenuSeparator />}

        {stores.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => selectStore(s.id)}
            className="gap-2"
          >
            <StoreIcon className={cn('h-4 w-4', currentStoreId === s.id && 'text-primary')} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-xs text-muted-foreground uppercase">{s.marketplace}</span>
            {currentStoreId === s.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/stores')} className="gap-2">
          <Settings className="h-4 w-4" />
          Kelola Toko
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/dashboard/stores?new=1')} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Toko Baru
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
