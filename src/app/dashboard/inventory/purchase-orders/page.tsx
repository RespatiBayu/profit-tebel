'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, Plus, Search, CheckCircle2, Clock, XCircle, PackageCheck, Trash2, Pencil, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { PurchaseOrder } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Dikonfirmasi',
  received: 'Diterima',
  cancelled: 'Dibatalkan',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'secondary',
  confirmed: 'outline',
  received: 'default',
  cancelled: 'destructive',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  draft: <Clock className="h-3.5 w-3.5" />,
  confirmed: <CheckCircle2 className="h-3.5 w-3.5" />,
  received: <PackageCheck className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

type PoWithLines = PurchaseOrder & {
  purchase_order_lines: Array<{
    id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number; total_cost: number;
    item: { id: string; name: string; unit: string; type: string } | null
  }>
}

const FILTERS = [
  { label: 'Semua', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Dikonfirmasi', value: 'confirmed' },
  { label: 'Diterima', value: 'received' },
  { label: 'Dibatalkan', value: 'cancelled' },
]

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [pos, setPos] = useState<PoWithLines[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})

  async function loadPos(status: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/inventory/purchase-orders?${params}`)
      const data = await res.json() as { purchase_orders?: PoWithLines[] }
      setPos(data.purchase_orders ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPos(statusFilter) }, [statusFilter])

  async function deletePo(po: PoWithLines) {
    if (!confirm(`Hapus PO ${po.po_number ?? po.id.slice(0, 8)}? Aksi ini tidak bisa dibatalkan.`)) return
    setDeleting((p) => ({ ...p, [po.id]: true }))
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) { alert(data.error ?? 'Gagal menghapus PO'); return }
      setPos((prev) => prev.filter((p) => p.id !== po.id))
      router.refresh()
    } finally {
      setDeleting((p) => ({ ...p, [po.id]: false }))
    }
  }

  const filtered = pos.filter((po) => {
    const q = search.toLowerCase()
    return (
      (po.po_number ?? '').toLowerCase().includes(q) ||
      (po.supplier ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Purchase Order
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catat pembelian bahan baku & stok masuk</p>
        </div>
        <Link href="/dashboard/inventory/purchase-orders/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Buat PO
          </Button>
        </Link>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${statusFilter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari no. PO atau pemasok..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center space-y-3">
          <ShoppingCart className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-semibold">Belum ada Purchase Order</p>
            <p className="text-sm text-muted-foreground mt-1">Buat PO baru untuk mencatat pembelian bahan baku.</p>
          </div>
          <Link href="/dashboard/inventory/purchase-orders/new">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Buat PO Pertama
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((po) => (
            <div key={po.id} className="border rounded-xl p-4 bg-background hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{po.po_number ?? `PO-${po.id.slice(0, 8)}`}</span>
                    <Badge
                      variant={STATUS_COLOR[po.status] as 'default' | 'secondary' | 'outline' | 'destructive'}
                      className="flex items-center gap-1 text-[10px]"
                    >
                      {STATUS_ICON[po.status]}
                      {STATUS_LABEL[po.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(po.date)}
                    {po.supplier && <> · {po.supplier}</>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {po.purchase_order_lines.length} item · {formatRp(po.total_amount)}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {po.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => deletePo(po)}
                      disabled={deleting[po.id]}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(po.status === 'draft' || po.status === 'confirmed') && (
                    <Link href={`/dashboard/inventory/purchase-orders/${po.id}/edit`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                  <Link href={`/dashboard/inventory/purchase-orders/${po.id}`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                      Detail
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
