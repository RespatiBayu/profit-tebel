'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, PackageX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface LowStockItem {
  id: string
  name: string
  unit: string
  type: string
  sku: string | null
  min_stock_qty: number
  qty_on_hand: number
}

const TYPE_LABEL: Record<string, string> = {
  raw_material: 'Bahan',
  semi_finished: 'Setengah Jadi',
  finished_good: 'Barang Jadi',
}

function fmtQty(n: number) {
  // Tampilkan tanpa desimal jika bulat, maksimal 2 desimal.
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

/**
 * Kartu "Stok Kritis" untuk dashboard analisis profit.
 *
 * Self-contained: fetch dari /api/inventory/low-stock. Bila user tidak punya
 * akses inventory (subscription-gated) API balas 401 → kartu disembunyikan.
 * Item dianggap kritis bila qty_on_hand <= min_stock_qty (min_stock_qty > 0).
 */
export function StockCriticalCard() {
  const [items, setItems] = useState<LowStockItem[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/inventory/low-stock')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setItems(j?.data ?? []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  // Tidak render apa pun saat loading / kosong / tanpa akses — biar dashboard bersih.
  if (!items || items.length === 0) return null

  const habis = items.filter((i) => i.qty_on_hand <= 0)
  const menipis = items.filter((i) => i.qty_on_hand > 0)
  const shown = items.slice(0, 6)

  return (
    <Card className="border-orange-200 bg-orange-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageX className="h-4 w-4 text-orange-600" />
          Stok Kritis
          <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
            {items.length} item
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {habis.length > 0 && <span className="font-medium text-red-600">{habis.length} habis</span>}
          {habis.length > 0 && menipis.length > 0 && ' · '}
          {menipis.length > 0 && <span>{menipis.length} menipis</span>}
          {' — segera restock biar penjualan & iklan nggak mandek.'}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {shown.map((item) => {
            const isHabis = item.qty_on_hand <= 0
            const ratio = item.min_stock_qty > 0 ? Math.min(1, item.qty_on_hand / item.min_stock_qty) : 0
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  isHabis ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-white'
                }`}
              >
                <AlertTriangle className={`h-4 w-4 shrink-0 ${isHabis ? 'text-red-600' : 'text-orange-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[item.type] ?? item.type}
                    {item.sku ? ` · ${item.sku}` : ''}
                  </p>
                  {/* Bar sisa stok terhadap minimum */}
                  <div className="mt-1.5 h-1.5 max-w-[180px] overflow-hidden rounded-full bg-orange-100">
                    <div
                      className={`h-full transition-all ${isHabis ? 'bg-red-500' : 'bg-orange-500'}`}
                      style={{ width: `${Math.max(ratio * 100, isHabis ? 0 : 6)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold tabular-nums ${isHabis ? 'text-red-600' : 'text-orange-600'}`}>
                    {fmtQty(item.qty_on_hand)} {item.unit}
                  </p>
                  <p className="text-[11px] text-muted-foreground">min {fmtQty(item.min_stock_qty)} {item.unit}</p>
                </div>
              </div>
            )
          })}
        </div>

        <Link
          href="/dashboard/inventory/stock"
          className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-orange-200 bg-white py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100/60"
        >
          {items.length > shown.length ? `Lihat semua ${items.length} item stok kritis` : 'Kelola stok'}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}
