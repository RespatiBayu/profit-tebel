'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Factory, Plus, CheckCircle2, Clock, XCircle, Play, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface BomInfo {
  id: string
  name: string | null
  output_qty: number
  output_item?: { id: string; name: string; unit: string; type: string } | null
}

interface ProductionOrderRow {
  id: string
  po_number: string | null
  bom_id: string
  status: string
  planned_qty: number
  actual_qty: number | null
  date: string
  notes: string | null
  total_material_cost: number | null
  hpp_per_unit: number | null
  created_at: string
  bom?: BomInfo | null
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'Sedang Produksi',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}
const STATUS_COLOR: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  in_progress: 'outline',
  completed: 'default',
  cancelled: 'destructive',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  draft: <Clock className="h-3.5 w-3.5" />,
  in_progress: <Play className="h-3.5 w-3.5" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const FILTERS = [
  { label: 'Semua', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Produksi', value: 'in_progress' },
  { label: 'Selesai', value: 'completed' },
  { label: 'Dibatalkan', value: 'cancelled' },
]

export default function ProductionOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})

  async function loadOrders(status: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/inventory/production-orders?${params}`)
      const data = await res.json() as { production_orders?: ProductionOrderRow[] }
      setOrders(data.production_orders ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOrders(statusFilter) }, [statusFilter])

  async function deleteOrder(order: ProductionOrderRow) {
    if (!confirm(`Hapus ${order.po_number ?? 'Production Order'}?`)) return
    setDeleting((p) => ({ ...p, [order.id]: true }))
    try {
      const res = await fetch(`/api/inventory/production-orders/${order.id}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) { alert(data.error ?? 'Gagal menghapus'); return }
      setOrders((prev) => prev.filter((o) => o.id !== order.id))
      router.refresh()
    } finally {
      setDeleting((p) => ({ ...p, [order.id]: false }))
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" />
            Produksi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Proses konversi bahan menjadi barang jadi</p>
        </div>
        <Link href="/dashboard/inventory/production/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Buat Order
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
      ) : orders.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center space-y-3">
          <Factory className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-semibold">Belum ada Production Order</p>
            <p className="text-sm text-muted-foreground mt-1">Buat order produksi untuk mengkonversi bahan baku menjadi barang jadi.</p>
          </div>
          <Link href="/dashboard/inventory/production/new">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Buat Order Pertama
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const bomName = order.bom?.name ?? order.bom?.output_item?.name ?? order.bom_id.slice(0, 8)
            const outputUnit = order.bom?.output_item?.unit ?? 'unit'
            return (
              <div key={order.id} className="border rounded-xl p-4 bg-background hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{order.po_number ?? `PROD-${order.id.slice(0, 8)}`}</span>
                      <Badge
                        variant={STATUS_COLOR[order.status]}
                        className="flex items-center gap-1 text-[10px]"
                      >
                        {STATUS_ICON[order.status]}
                        {STATUS_LABEL[order.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(order.date)} · {bomName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.status === 'completed' && order.actual_qty != null
                        ? `Aktual: ${order.actual_qty} ${outputUnit}`
                        : `Rencana: ${order.planned_qty} ${outputUnit}`
                      }
                      {order.hpp_per_unit != null && ` · HPP: ${formatRp(order.hpp_per_unit)}/${outputUnit}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {order.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteOrder(order)}
                        disabled={deleting[order.id]}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Link href={`/dashboard/inventory/production/${order.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        Detail
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
