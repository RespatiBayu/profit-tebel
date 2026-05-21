'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, Play, Hammer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProductionOrder, ProductionOrderLine, Item } from '@/types'

interface ProductionOrderDetailProps {
  order: ProductionOrder & {
    lines: (ProductionOrderLine & { item?: Item | null; avg_cost?: number | null })[]
    bom?: {
      id: string
      name: string | null
      output_qty: number
      output_item?: { id: string; name: string; unit: string; type: string } | null
    } | null
  }
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

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function ProductionOrderDetail({ order: initialOrder }: ProductionOrderDetailProps) {
  const router = useRouter()
  const [order, setOrder] = useState(initialOrder)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Complete form state
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [actualQty, setActualQty] = useState(String(order.planned_qty))
  const [actualLines, setActualLines] = useState<Record<string, string>>(
    Object.fromEntries(order.lines.map((l) => [l.id, String(l.planned_qty)]))
  )

  async function handleStart() {
    setStarting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inventory/production-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal memulai produksi'); return }
      setOrder((prev) => ({ ...prev, status: 'in_progress' }))
      router.refresh()
    } finally {
      setStarting(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Batalkan Production Order ini?')) return
    setCancelling(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inventory/production-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal membatalkan'); return }
      setOrder((prev) => ({ ...prev, status: 'cancelled' }))
      router.refresh()
    } finally {
      setCancelling(false)
    }
  }

  async function handleComplete() {
    const qty = parseFloat(actualQty)
    if (!qty || qty <= 0) { setErrorMsg('Qty aktual harus > 0'); return }

    setCompleting(true)
    setErrorMsg(null)
    try {
      const actual_lines = order.lines.map((l) => ({
        line_id: l.id,
        actual_qty: parseFloat(actualLines[l.id] ?? String(l.planned_qty)) || l.planned_qty,
      }))

      const res = await fetch(`/api/inventory/production-orders/${order.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_qty: qty, actual_lines }),
      })
      const data = await res.json() as {
        success?: boolean; hpp_per_unit?: number; total_material_cost?: number;
        synced_to_master?: boolean; error?: string
      }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal menyelesaikan produksi'); return }

      const msg = `Produksi selesai! HPP: ${formatRp(data.hpp_per_unit ?? 0)}/${order.bom?.output_item?.unit ?? 'unit'}` +
        (data.synced_to_master ? ' · HPP diperbarui di Master Produk.' : '')
      setSuccessMsg(msg)
      setOrder((prev) => ({
        ...prev,
        status: 'completed',
        actual_qty: qty,
        hpp_per_unit: data.hpp_per_unit ?? null,
        total_material_cost: data.total_material_cost ?? null,
      }))
      setShowCompleteForm(false)
      router.refresh()
    } finally {
      setCompleting(false)
    }
  }

  const canStart = order.status === 'draft'
  const canComplete = order.status === 'draft' || order.status === 'in_progress'
  const canCancel = order.status === 'draft' || order.status === 'in_progress'

  return (
    <div className="space-y-5">
      {/* Status + actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Badge variant={STATUS_COLOR[order.status]} className="text-sm px-3 py-1">
              {STATUS_LABEL[order.status]}
            </Badge>
            <div className="flex items-center gap-2 flex-wrap">
              {canStart && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleStart} disabled={starting}>
                  {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Mulai Produksi
                </Button>
              )}
              {canComplete && !showCompleteForm && (
                <Button size="sm" className="gap-1.5" onClick={() => setShowCompleteForm(true)}>
                  <Hammer className="h-3.5 w-3.5" />
                  Selesaikan
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Batalkan
                </Button>
              )}
            </div>
          </div>

          {successMsg && (
            <p className="text-sm text-primary bg-primary/8 px-3 py-2 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
            </p>
          )}
          {errorMsg && (
            <p className="text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {errorMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Complete form */}
      {showCompleteForm && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Hammer className="h-4 w-4 text-primary" />
              Konfirmasi Hasil Produksi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                Qty Aktual Diproduksi <span className="text-destructive">*</span>
              </Label>
              <div className="relative max-w-xs">
                <Input
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                  className="pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {order.bom?.output_item?.unit ?? 'unit'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Rencana: {order.planned_qty} {order.bom?.output_item?.unit ?? 'unit'}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Qty Bahan yang Dipakai</Label>
              <p className="text-xs text-muted-foreground">Ubah jika ada selisih dari rencana. Biarkan jika sesuai.</p>
              <div className="space-y-2">
                {order.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <span className="text-sm flex-1 min-w-0 truncate">{l.item?.name ?? l.item_id}</span>
                    <div className="relative w-28 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={actualLines[l.id] ?? String(l.planned_qty)}
                        onChange={(e) => setActualLines((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        className="h-8 text-sm pr-8"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                        {l.item?.unit ?? ''}
                      </span>
                    </div>
                    {l.avg_cost != null && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRp(l.avg_cost)}/{l.item?.unit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCompleteForm(false)} disabled={completing}>
                Batal
              </Button>
              <Button type="button" className="flex-1" onClick={handleComplete} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Selesaikan Produksi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Informasi Produksi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">No. Produksi</p>
              <p className="font-medium">{order.po_number ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tanggal</p>
              <p className="font-medium">{formatDate(order.date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BOM</p>
              <p className="font-medium">{order.bom?.name ?? order.bom?.output_item?.name ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Output Item</p>
              <p className="font-medium">{order.bom?.output_item?.name ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Qty Rencana</p>
              <p className="font-medium">{order.planned_qty} {order.bom?.output_item?.unit}</p>
            </div>
            {order.actual_qty && (
              <div>
                <p className="text-xs text-muted-foreground">Qty Aktual</p>
                <p className="font-medium text-primary">{order.actual_qty} {order.bom?.output_item?.unit}</p>
              </div>
            )}
            {order.hpp_per_unit != null && (
              <div>
                <p className="text-xs text-muted-foreground">HPP per Unit</p>
                <p className="font-semibold text-primary">{formatRp(order.hpp_per_unit)}</p>
              </div>
            )}
            {order.total_material_cost != null && (
              <div>
                <p className="text-xs text-muted-foreground">Total Biaya Bahan</p>
                <p className="font-medium">{formatRp(order.total_material_cost)}</p>
              </div>
            )}
          </div>
          {order.notes && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p>{order.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daftar Bahan</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {order.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{line.item?.name ?? line.item_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Rencana: {line.planned_qty} {line.item?.unit}
                    {line.avg_cost != null && ` · ${formatRp(line.avg_cost)}/${line.item?.unit}`}
                  </p>
                  {order.status === 'completed' && line.actual_qty != null && (
                    <p className="text-xs text-green-600">
                      ✓ Aktual: {line.actual_qty} {line.item?.unit}
                      {line.unit_cost_snapshot != null && ` · ${formatRp(line.unit_cost_snapshot)}/${line.item?.unit}`}
                    </p>
                  )}
                </div>
                {order.status === 'completed' && line.actual_qty != null && line.unit_cost_snapshot != null && (
                  <p className="text-sm font-semibold shrink-0">
                    {formatRp(line.actual_qty * line.unit_cost_snapshot)}
                  </p>
                )}
              </div>
            ))}
          </div>
          {order.status === 'completed' && order.total_material_cost != null && (
            <div className="flex justify-between items-center px-4 py-3 border-t bg-muted/30 rounded-b-xl">
              <span className="text-sm font-semibold">Total Biaya Bahan</span>
              <span className="text-base font-bold text-primary">{formatRp(order.total_material_cost)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
