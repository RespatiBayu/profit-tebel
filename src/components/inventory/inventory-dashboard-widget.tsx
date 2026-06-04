'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Boxes, AlertTriangle, Hammer, ShoppingCart,
  ArrowRight, Loader2,
} from 'lucide-react'

interface InventorySummary {
  totalItems: number
  totalStockValue: number
  lowStockCount: number
  zeroStockCount: number
  pendingPOCount: number
  pendingProductionCount: number
  lowStockItems: Array<{ id: string; name: string; unit: string; qty_on_hand: number; min_stock_qty: number }>
}

function formatRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export function InventoryDashboardWidget() {
  const [data, setData]     = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/inventory/dashboard-summary')
      .then((r) => r.json())
      .then((j) => setData(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 flex items-center justify-center h-24">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.totalItems === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          Ringkasan Inventori
        </h2>
        <Link href="/dashboard/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">
          Lihat detail <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total Item</p>
          <p className="text-xl font-bold tabular-nums mt-1">{data.totalItems}</p>
          <p className="text-[11px] text-muted-foreground">item terdaftar</p>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Nilai Stok</p>
          <p className="text-base font-bold tabular-nums mt-1 truncate">{formatRp(data.totalStockValue)}</p>
          <p className="text-[11px] text-muted-foreground">avg cost × qty</p>
        </div>

        <Link href="/dashboard/inventory/purchase-orders?status=draft" className="rounded-xl border bg-card p-3 hover:border-primary/30 hover:shadow-sm transition-all group">
          <p className="text-xs text-muted-foreground">PO Pending</p>
          <p className="text-xl font-bold tabular-nums mt-1 group-hover:text-primary transition-colors">{data.pendingPOCount}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> belum diterima
          </p>
        </Link>

        <Link href="/dashboard/inventory/production?status=in_progress" className="rounded-xl border bg-card p-3 hover:border-primary/30 hover:shadow-sm transition-all group">
          <p className="text-xs text-muted-foreground">Produksi Aktif</p>
          <p className="text-xl font-bold tabular-nums mt-1 group-hover:text-primary transition-colors">{data.pendingProductionCount}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Hammer className="h-3 w-3" /> in progress
          </p>
        </Link>
      </div>

      {/* Low stock alert */}
      {data.lowStockCount > 0 && (
        <Link href="/dashboard/inventory/stock" className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 hover:bg-orange-100/60 transition-colors group">
          <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              {data.lowStockCount} item stok menipis
              {data.zeroStockCount > 0 && ` (${data.zeroStockCount} habis)`}
            </p>
            <p className="text-xs text-orange-600 truncate">
              {data.lowStockItems.slice(0, 3).map((i) => i.name).join(', ')}
              {data.lowStockCount > 3 ? ` +${data.lowStockCount - 3} lainnya` : ''}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-orange-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  )
}
