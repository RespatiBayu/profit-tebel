'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, ChevronDown, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface BomOption {
  id: string
  name: string | null
  output_qty: number
  output_item: { id: string; name: string; unit: string; type: string } | null
}

// BOM picker dropdown
function BomPicker({
  value,
  onChange,
}: {
  value: BomOption | null
  onChange: (bom: BomOption | null) => void
}) {
  const [q, setQ] = useState('')
  const [boms, setBoms] = useState<BomOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const search = useCallback(async (query: string) => {
    const params = new URLSearchParams({ q: query || '' })
    const res = await fetch(`/api/inventory/bom?${params}`)
    const data = await res.json() as { boms?: BomOption[] }
    setBoms(data.boms ?? [])
  }, [])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => search(q), 200)
      return () => clearTimeout(t)
    }
  }, [q, open, search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
        <ClipboardList className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{value.name ?? value.output_item?.name ?? value.id}</p>
          <p className="text-xs text-muted-foreground">Output: {value.output_item?.name} · {value.output_qty} {value.output_item?.unit}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Ganti</Button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input
          placeholder="Cari formula..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="pr-8"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {boms.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Belum ada formula. Buat Formula dulu di menu Formula (Resep Produksi).</p>
          ) : (
            boms.map((bom) => (
              <button
                key={bom.id}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(bom)
                  setOpen(false)
                  setQ('')
                }}
              >
                <p className="text-sm font-medium">{bom.name ?? bom.output_item?.name ?? bom.id}</p>
                <p className="text-xs text-muted-foreground">
                  Output: {bom.output_item?.name} · {bom.output_qty} {bom.output_item?.unit}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ProductionOrderForm() {
  const router = useRouter()
  const [selectedBom, setSelectedBom] = useState<BomOption | null>(null)
  const [plannedQty, setPlannedQty] = useState('1')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [poNumber, setPoNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Preview: hitung qty bahan yang akan dipakai
  const planned = parseFloat(plannedQty) || 0
  const multiplier = selectedBom && selectedBom.output_qty > 0 ? planned / selectedBom.output_qty : 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedBom) { setSaveError('Pilih Formula terlebih dahulu'); return }
    if (planned <= 0) { setSaveError('Qty produksi harus > 0'); return }
    if (!date) { setSaveError('Tanggal wajib diisi'); return }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/inventory/production-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bom_id: selectedBom.id,
          planned_qty: planned,
          date,
          po_number: poNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json() as { production_order?: { id: string }; error?: string }
      if (!res.ok) { setSaveError(data.error ?? 'Terjadi kesalahan'); return }
      router.push(`/dashboard/inventory/production/${data.production_order?.id}`)
      router.refresh()
    } catch {
      setSaveError('Gagal menyimpan. Cek koneksi internet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
      {/* BOM + qty */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rencana Produksi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Formula (Resep Produksi) <span className="text-destructive">*</span></Label>
            <BomPicker value={selectedBom} onChange={setSelectedBom} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="planned-qty">
                Qty Diproduksi <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="planned-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {selectedBom?.output_item?.unit ?? 'unit'}
                </span>
              </div>
              {selectedBom && (
                <p className="text-xs text-muted-foreground">
                  1 proses Formula = {selectedBom.output_qty} {selectedBom.output_item?.unit}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-date">Tanggal <span className="text-destructive">*</span></Label>
              <Input
                id="prod-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prod-number">No. Produksi <span className="text-muted-foreground text-xs">(auto)</span></Label>
              <Input
                id="prod-number"
                placeholder="cth. PROD-202506-001"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-notes">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
              <Textarea
                id="prod-notes"
                placeholder="cth. Batch pagi"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview material yang akan dipakai */}
      {selectedBom && planned > 0 && multiplier > 0 && (
        <Card className="border-primary/20 bg-primary/3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Preview</Badge>
              Estimasi Bahan yang Digunakan
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground mb-2">
              Berdasarkan Formula — bahan aktual dikonfirmasi saat selesai produksi.
            </p>
            <p className="text-xs text-muted-foreground">
              Multiplier: {plannedQty} ÷ {selectedBom.output_qty} = <span className="font-medium text-foreground">{multiplier.toFixed(4)}×</span>
            </p>
          </CardContent>
        </Card>
      )}

      {saveError && (
        <p className="text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {saveError}
        </p>
      )}

      <div className="flex gap-3 pb-6">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Buat Production Order
        </Button>
      </div>
    </form>
  )
}
