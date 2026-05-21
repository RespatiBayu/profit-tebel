'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PoLineEditor, type PoLineData } from './po-line-editor'
import type { PurchaseOrder } from '@/types'

interface PoFormProps {
  poId?: string
  initialData?: {
    po_number: string
    date: string
    supplier: string
    notes: string
    lines: PoLineData[]
  }
}

export function PoForm({ poId, initialData }: PoFormProps) {
  const router = useRouter()
  const isEdit = Boolean(poId)

  const [poNumber, setPoNumber] = useState(initialData?.po_number ?? '')
  const [date, setDate] = useState(initialData?.date ?? new Date().toISOString().slice(0, 10))
  const [supplier, setSupplier] = useState(initialData?.supplier ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [lines, setLines] = useState<PoLineData[]>(initialData?.lines ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { setSaveError('Tanggal wajib diisi'); return }
    const incompleteLines = lines.filter((l) => !l.item_id)
    if (incompleteLines.length > 0) { setSaveError('Semua baris harus dipilih item-nya'); return }
    if (lines.length === 0) { setSaveError('PO harus memiliki minimal 1 item'); return }
    if (lines.some((l) => l.qty_ordered <= 0)) { setSaveError('Qty harus lebih dari 0'); return }

    setSaving(true)
    setSaveError(null)

    const payload = {
      po_number: poNumber.trim() || null,
      date,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        item_id: l.item_id,
        qty_ordered: l.qty_ordered,
        unit_cost: l.unit_cost,
      })),
    }

    try {
      const url = isEdit ? `/api/inventory/purchase-orders/${poId}` : '/api/inventory/purchase-orders'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { purchase_order?: PurchaseOrder; success?: boolean; error?: string }
      if (!res.ok) { setSaveError(data.error ?? 'Terjadi kesalahan'); return }
      router.push('/dashboard/inventory/purchase-orders')
      router.refresh()
    } catch {
      setSaveError('Gagal menyimpan. Cek koneksi internet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
      {/* Header info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informasi PO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Tanggal <span className="text-destructive">*</span></Label>
              <Input
                id="po-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-number">No. PO <span className="text-muted-foreground text-xs">(auto jika kosong)</span></Label>
              <Input
                id="po-number"
                placeholder="cth. PO-202506-001"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Pemasok <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Input
              id="po-supplier"
              placeholder="cth. CV Maju Jaya"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Textarea
              id="po-notes"
              placeholder="cth. Pembayaran via transfer BCA"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Item yang Dibeli</CardTitle>
        </CardHeader>
        <CardContent>
          <PoLineEditor lines={lines} onChange={setLines} />
        </CardContent>
      </Card>

      {saveError && (
        <p className="text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {saveError}
        </p>
      )}

      <div className="flex gap-3 pb-6">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
          disabled={saving}
        >
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEdit ? 'Simpan Perubahan' : 'Buat PO'}
        </Button>
      </div>
    </form>
  )
}
