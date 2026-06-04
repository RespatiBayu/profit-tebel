'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Package, ChevronRight, TrendingDown, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { ItemType } from '@/types'
import { AdjustmentDialog } from './adjustment-dialog'

function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

interface StockRow {
  id: string
  name: string
  sku: string | null
  type: ItemType
  unit: string
  cost_per_unit: number
  qty_on_hand: number
  avg_cost: number | null
  last_transaction_date: string | null
  transaction_count: number
}

const TYPE_LABELS: Record<ItemType, string> = {
  raw_material:  'Bahan Baku',
  semi_finished: 'Setengah Jadi',
  finished_good: 'Barang Jadi',
}

const TYPE_COLORS: Record<ItemType, string> = {
  raw_material:  'bg-blue-100 text-blue-700',
  semi_finished: 'bg-purple-100 text-purple-700',
  finished_good: 'bg-green-100 text-green-700',
}

const ALL_TYPES: ItemType[] = ['raw_material', 'semi_finished', 'finished_good']

export function StockTable() {
  const [rows, setRows]         = useState<StockRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [typeFilter, setType]   = useState<ItemType | ''>('')
  const [adjItem, setAdjItem]   = useState<StockRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q)          params.set('q', q)
      if (typeFilter) params.set('type', typeFilter)
      const res  = await fetch(`/api/inventory/stock?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [q, typeFilter])

  useEffect(() => {
    const t = setTimeout(fetchData, 300)
    return () => clearTimeout(t)
  }, [fetchData])

  const handleAdjusted = () => {
    setAdjItem(null)
    fetchData()
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari item..."
            className="pl-9 h-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setType('')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            typeFilter === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
          }`}
        >
          Semua
        </button>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(typeFilter === t ? '' : t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Belum ada item.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const lowStock = row.qty_on_hand <= 0
            return (
              <div key={row.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{row.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[row.type]}`}>
                      {TYPE_LABELS[row.type]}
                    </span>
                    {lowStock && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertCircle className="h-2.5 w-2.5" /> Stok habis
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {row.sku && <span>SKU: {row.sku}</span>}
                    <span>Avg cost: {row.avg_cost != null ? formatRp(row.avg_cost) : '—'}/{row.unit}</span>
                    {row.last_transaction_date && (
                      <span>
                        Terakhir:{' '}
                        {new Date(row.last_transaction_date).toLocaleDateString('id-ID', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Qty on hand */}
                <div className="text-right shrink-0">
                  <p className={`text-base font-bold tabular-nums ${lowStock ? 'text-red-600' : ''}`}>
                    {Number(row.qty_on_hand).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{row.unit}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setAdjItem(row)}
                    title="Koreksi stok"
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <TrendingDown className="h-4 w-4" />
                  </button>
                  <Link
                    href={`/dashboard/inventory/stock/${row.id}`}
                    title="Lihat mutasi"
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Adjustment dialog */}
      {adjItem && (
        <AdjustmentDialog
          item={{ id: adjItem.id, name: adjItem.name, unit: adjItem.unit, qty_on_hand: adjItem.qty_on_hand }}
          onClose={() => setAdjItem(null)}
          onSaved={handleAdjusted}
        />
      )}
    </div>
  )
}
