'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, PackageCheck, Pencil, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PurchaseOrder, PurchaseOrderLine } from '@/types'
import type { Item } from '@/types'

interface PoDetailProps {
  po: PurchaseOrder & {
    lines: (PurchaseOrderLine & { item?: Item | null })[]
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Dikonfirmasi',
  received: 'Diterima',
  cancelled: 'Dibatalkan',
}
const STATUS_COLOR: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  confirmed: 'outline',
  received: 'default',
  cancelled: 'destructive',
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function PurchaseOrderDetail({ po: initialPo }: PoDetailProps) {
  const router = useRouter()
  const [po, setPo] = useState(initialPo)
  const [receiving, setReceiving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleReceive() {
    if (!confirm('Tandai PO ini sebagai sudah diterima? Stok akan otomatis bertambah.')) return
    setReceiving(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}/receive`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; transactions_created?: number; error?: string }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal menerima PO'); return }
      setSuccessMsg(`PO diterima! ${data.transactions_created ?? 0} transaksi stok dibuat.`)
      setPo((prev) => ({ ...prev, status: 'received' }))
      router.refresh()
    } finally {
      setReceiving(false)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal konfirmasi PO'); return }
      setPo((prev) => ({ ...prev, status: 'confirmed' }))
      router.refresh()
    } finally {
      setConfirming(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Batalkan PO ini?')) return
    setCancelling(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setErrorMsg(data.error ?? 'Gagal membatalkan PO'); return }
      setPo((prev) => ({ ...prev, status: 'cancelled' }))
      router.refresh()
    } finally {
      setCancelling(false)
    }
  }

  const canEdit = po.status === 'draft' || po.status === 'confirmed'
  const canConfirm = po.status === 'draft'
  const canReceive = po.status === 'confirmed' || po.status === 'draft'
  const canCancel = po.status === 'draft' || po.status === 'confirmed'

  return (
    <div className="space-y-5">
      {/* Status + actions */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Badge variant={STATUS_COLOR[po.status]} className="text-sm px-3 py-1">
              {STATUS_LABEL[po.status]}
            </Badge>
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <Link href={`/dashboard/inventory/purchase-orders/${po.id}/edit`}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </Link>
              )}
              {canConfirm && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Konfirmasi
                </Button>
              )}
              {canReceive && (
                <Button size="sm" className="gap-1.5" onClick={handleReceive} disabled={receiving}>
                  {receiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                  Terima Barang
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

      {/* Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Informasi PO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">No. PO</p>
              <p className="font-medium">{po.po_number ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tanggal</p>
              <p className="font-medium">{formatDate(po.date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pemasok</p>
              <p className="font-medium">{po.supplier ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold text-primary">{formatRp(po.total_amount)}</p>
            </div>
          </div>
          {po.notes && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p>{po.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daftar Item</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {po.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{line.item?.name ?? line.item_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.qty_ordered} {line.item?.unit ?? 'unit'} × {formatRp(line.unit_cost)}
                  </p>
                  {po.status === 'received' && (
                    <p className="text-xs text-green-600">✓ Diterima: {line.qty_received} {line.item?.unit ?? 'unit'}</p>
                  )}
                </div>
                <p className="text-sm font-semibold shrink-0">{formatRp(line.qty_ordered * line.unit_cost)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t bg-muted/30 rounded-b-xl">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-base font-bold text-primary">{formatRp(po.total_amount)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
