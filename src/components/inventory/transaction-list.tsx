'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Settings, ShoppingCart, Hammer, Tag } from 'lucide-react'
function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
import type { InventoryTransactionType } from '@/types'

interface TxRow {
  id: string
  transaction_type: InventoryTransactionType
  qty: number
  unit_cost: number | null
  date: string
  notes: string | null
  reference_type: string | null
  reference_id: string | null
  created_at: string
}

interface TransactionListProps {
  itemId: string
  unit: string
}

const TX_META: Record<InventoryTransactionType, { label: string; color: string; Icon: React.ElementType }> = {
  purchase_in:    { label: 'Pembelian Masuk',  color: 'text-green-600',  Icon: ShoppingCart },
  production_in:  { label: 'Produksi Masuk',   color: 'text-blue-600',   Icon: Hammer },
  production_out: { label: 'Produksi Keluar',  color: 'text-orange-600', Icon: Hammer },
  sale_out:       { label: 'Penjualan Keluar', color: 'text-red-600',    Icon: Tag },
  adjustment:     { label: 'Koreksi Manual',   color: 'text-purple-600', Icon: Settings },
}

const ALL_TYPES: InventoryTransactionType[] = [
  'purchase_in', 'production_in', 'production_out', 'sale_out', 'adjustment',
]

export function TransactionList({ itemId, unit }: TransactionListProps) {
  const [rows, setRows]       = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [txType, setTxType]   = useState<InventoryTransactionType | ''>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (txType) params.set('type', txType)
      const res  = await fetch(`/api/inventory/stock/${itemId}/transactions?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [itemId, txType])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-3">
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setTxType('')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            txType === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
          }`}
        >
          Semua
        </button>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTxType(txType === t ? '' : t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              txType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {TX_META[t].label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada transaksi.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const meta = TX_META[row.transaction_type]
            const isIn = row.qty > 0
            return (
              <div key={row.id} className="rounded-lg border bg-card px-3 py-2.5 flex items-center gap-3">
                {isIn ? (
                  <ArrowUpCircle className={`h-5 w-5 shrink-0 ${meta.color}`} />
                ) : (
                  <ArrowDownCircle className={`h-5 w-5 shrink-0 ${meta.color}`} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{meta.label}</span>
                    {row.notes && (
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">{row.notes}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {row.unit_cost != null && ` · ${formatRp(row.unit_cost)}/${unit}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                    {isIn ? '+' : ''}{Number(row.qty).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{unit}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
