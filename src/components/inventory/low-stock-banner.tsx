'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react'

interface LowStockItem {
  id: string
  name: string
  unit: string
  type: string
  sku: string | null
  min_stock_qty: number
  qty_on_hand: number
}

export function LowStockBanner() {
  const [items, setItems]       = useState<LowStockItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/inventory/low-stock')
      .then((r) => r.json())
      .then((j) => setItems(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading || items.length === 0) return null

  const preview = expanded ? items : items.slice(0, 3)

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-100/60 transition-colors"
      >
        <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-orange-800">
            {items.length} item stok menipis
          </p>
          <p className="text-xs text-orange-600">
            Stok di bawah batas minimum yang ditentukan
          </p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-orange-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-orange-500 shrink-0" />
        }
      </button>

      {/* Item list */}
      <div className="border-t border-orange-200 divide-y divide-orange-100">
        {preview.map((item) => {
          const ratio = item.min_stock_qty > 0 ? item.qty_on_hand / item.min_stock_qty : 0
          const isEmpty = item.qty_on_hand <= 0
          return (
            <Link
              key={item.id}
              href={`/dashboard/inventory/stock/${item.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-100/50 transition-colors"
            >
              <TrendingDown className={`h-4 w-4 shrink-0 ${isEmpty ? 'text-red-500' : 'text-orange-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-orange-900">{item.name}</p>
                {item.sku && <p className="text-[11px] text-orange-600">{item.sku}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold tabular-nums ${isEmpty ? 'text-red-600' : 'text-orange-700'}`}>
                  {Number(item.qty_on_hand).toLocaleString('id-ID', { maximumFractionDigits: 2 })} {item.unit}
                </p>
                <p className="text-[10px] text-orange-500">
                  min {Number(item.min_stock_qty).toLocaleString('id-ID', { maximumFractionDigits: 2 })} {item.unit}
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-12 shrink-0">
                <div className="h-1.5 rounded-full bg-orange-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isEmpty ? 'bg-red-500' : ratio < 0.5 ? 'bg-orange-500' : 'bg-yellow-400'}`}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          )
        })}

        {!expanded && items.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-4 py-2 text-xs text-orange-600 font-medium hover:bg-orange-100/50 transition-colors text-center"
          >
            Lihat {items.length - 3} item lainnya →
          </button>
        )}
      </div>
    </div>
  )
}
