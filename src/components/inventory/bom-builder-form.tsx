'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BomLineEditor, type BomLineData } from './bom-line-editor'
import type { Item } from '@/types'
import type { BomCalcResult } from '@/lib/inventory/bom-calculator'

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

// Komponen search output item (hanya semi_finished / finished_good)
function OutputItemPicker({
  value,
  onChange,
}: {
  value: Item | null
  onChange: (item: Item | null) => void
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)

  const search = useCallback(async (query: string) => {
    const params = new URLSearchParams({ q: query || '' })
    const res = await fetch(`/api/inventory/items?${params}`)
    const data = await res.json() as { items?: Item[] }
    // Hanya semi_finished dan finished_good bisa jadi output BOM
    setItems((data.items ?? []).filter((i) => i.type !== 'raw_material'))
  }, [])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => search(q), 200)
      return () => clearTimeout(t)
    }
  }, [q, open, search])

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{value.name}</p>
          <p className="text-xs text-muted-foreground">{value.type === 'semi_finished' ? 'Barang Setengah Jadi' : 'Barang Jadi'} · {value.unit}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Ganti</Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        placeholder="Cari barang jadi atau setengah jadi..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">
              Tidak ada item. Tambah dulu di Master Item (tipe Setengah Jadi / Barang Jadi).
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(item)
                  setOpen(false)
                  setQ('')
                }}
              >
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.type === 'semi_finished' ? 'Setengah Jadi' : 'Barang Jadi'} · {item.unit}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface BomBuilderFormProps {
  bomId?: string                      // ada isinya = mode edit
  initialData?: {
    output_item: Item
    output_qty: number
    name: string
    notes: string
    lines: BomLineData[]
  }
}

export function BomBuilderForm({ bomId, initialData }: BomBuilderFormProps) {
  const router = useRouter()
  const isEdit = Boolean(bomId)

  const [outputItem, setOutputItem] = useState<Item | null>(initialData?.output_item ?? null)
  const [outputQty, setOutputQty] = useState(String(initialData?.output_qty ?? 1))
  const [name, setName] = useState(initialData?.name ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [lines, setLines] = useState<BomLineData[]>(initialData?.lines ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Live HPP preview — kalkulasi client-side sederhana (tanpa rekursi penuh)
  const [hppPreview, setHppPreview] = useState<BomCalcResult | null>(null)

  useEffect(() => {
    const qty = parseFloat(outputQty) || 1
    let totalCost = 0
    const hasMissingCost = lines.some(
      (l) => l.item?.id && !l.item.avg_cost && !l.item.cost_per_unit && l.item.type !== 'semi_finished'
    )
    let hasUnresolved = false

    for (const line of lines) {
      if (!line.item?.id) { hasUnresolved = true; continue }
      if (line.item.type === 'semi_finished') continue // skip, need server-side recursive
      const cost = (line.item.avg_cost ?? line.item.cost_per_unit ?? 0) * line.qty_per_output
      totalCost += cost
    }

    setHppPreview({
      hpp_per_unit: qty > 0 ? Math.round((totalCost / qty) * 100) / 100 : 0,
      total_material_cost: Math.round(totalCost * 100) / 100,
      breakdown: [],
      has_cycle: false,
      missing_items: hasMissingCost || hasUnresolved ? ['placeholder'] : [],
    })
  }, [lines, outputQty])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!outputItem) { setSaveError('Pilih produk output BOM terlebih dahulu'); return }
    const incompleteLines = lines.filter((l) => !l.input_item_id)
    if (incompleteLines.length > 0) { setSaveError('Semua baris bahan harus dipilih item-nya'); return }
    if (lines.length === 0) { setSaveError('BOM harus memiliki minimal 1 bahan'); return }

    setSaving(true)
    setSaveError(null)

    const payload = {
      output_item_id: outputItem.id,
      output_qty: parseFloat(outputQty) || 1,
      name: name.trim() || null,
      notes: notes.trim() || null,
      lines: lines.map((l, i) => ({
        input_item_id: l.input_item_id,
        qty_per_output: l.qty_per_output,
        sort_order: i,
        notes: l.notes || null,
      })),
    }

    try {
      const url = isEdit ? `/api/inventory/bom/${bomId}` : '/api/inventory/bom'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { bom?: { id: string }; success?: boolean; error?: string }
      if (!res.ok) { setSaveError(data.error ?? 'Terjadi kesalahan'); return }
      router.push('/dashboard/inventory/bom')
      router.refresh()
    } catch {
      setSaveError('Gagal menyimpan. Cek koneksi internet.')
    } finally {
      setSaving(false)
    }
  }

  const hasUnresolved = lines.some((l) => !l.input_item_id)
  const hasSemiFinished = lines.some((l) => l.item?.type === 'semi_finished')

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
      {/* Output Product */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produk Output</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Produk yang dihasilkan <span className="text-destructive">*</span></Label>
            <OutputItemPicker value={outputItem} onChange={setOutputItem} />
            <p className="text-xs text-muted-foreground">
              Hanya Barang Setengah Jadi dan Barang Jadi yang bisa jadi output BOM.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="output-qty">
                Qty Output per Proses <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="output-qty"
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {outputItem?.unit ?? 'unit'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Berapa {outputItem?.unit ?? 'unit'} yang dihasilkan dari 1x proses produksi ini?</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bom-name">Nama BOM <span className="text-muted-foreground text-xs">(opsional)</span></Label>
              <Input
                id="bom-name"
                placeholder={outputItem?.name ?? 'cth. Resep Standar'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bom-notes">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Textarea
              id="bom-notes"
              placeholder="cth. Resep standar produksi batch 100 pcs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* BOM Lines */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Bahan</CardTitle>
        </CardHeader>
        <CardContent>
          <BomLineEditor
            lines={lines}
            outputItemId={outputItem?.id ?? ''}
            onChange={setLines}
          />
        </CardContent>
      </Card>

      {/* HPP Preview */}
      {lines.length > 0 && outputItem && hppPreview && (
        <Card className="border-primary/20 bg-primary/3">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Estimasi HPP (preview)
            </p>
            {hasUnresolved ? (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Beberapa bahan belum dipilih — estimasi belum akurat
              </p>
            ) : hasSemiFinished ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                Ada bahan setengah jadi — HPP final dihitung server setelah disimpan
              </p>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-muted-foreground">HPP per {outputItem.unit}:</span>
              <span className="text-xl font-bold text-primary">{formatRp(hppPreview.hpp_per_unit)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total biaya bahan per proses ({outputQty} {outputItem.unit}):</span>
              <span>{formatRp(hppPreview.total_material_cost)}</span>
            </div>
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
          {isEdit ? 'Simpan Perubahan' : 'Buat BOM'}
        </Button>
      </div>
    </form>
  )
}
