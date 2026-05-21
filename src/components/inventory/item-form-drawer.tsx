'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Item, ItemType } from '@/types'

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw_material: 'Bahan Mentah',
  semi_finished: 'Barang Setengah Jadi',
  finished_good: 'Barang Jadi',
}

const COMMON_UNITS = ['pcs', 'kg', 'gram', 'liter', 'ml', 'lusin', 'karton', 'roll', 'lembar', 'botol', 'sachet']

interface ItemFormDrawerProps {
  open: boolean
  item?: Item | null       // null = mode tambah, ada isinya = mode edit
  onClose: () => void
  onSaved: (item: Item) => void
}

export function ItemFormDrawer({ open, item, onClose, onSaved }: ItemFormDrawerProps) {
  const isEdit = Boolean(item)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [type, setType] = useState<ItemType>('raw_material')
  const [unit, setUnit] = useState('pcs')
  const [customUnit, setCustomUnit] = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')
  const [notes, setNotes] = useState('')

  // Isi form saat edit
  useEffect(() => {
    if (item) {
      setName(item.name)
      setSku(item.sku ?? '')
      setType(item.type)
      const isCommon = COMMON_UNITS.includes(item.unit)
      setUnit(isCommon ? item.unit : 'custom')
      setCustomUnit(isCommon ? '' : item.unit)
      setCostPerUnit(item.cost_per_unit > 0 ? String(item.cost_per_unit) : '')
      setNotes(item.notes ?? '')
    } else {
      setName('')
      setSku('')
      setType('raw_material')
      setUnit('pcs')
      setCustomUnit('')
      setCostPerUnit('')
      setNotes('')
    }
    setError(null)
  }, [item, open])

  const resolvedUnit = unit === 'custom' ? customUnit.trim() || 'pcs' : unit

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nama item wajib diisi'); return }
    if (unit === 'custom' && !customUnit.trim()) { setError('Satuan kustom wajib diisi'); return }

    setLoading(true)
    setError(null)

    const payload = {
      name: name.trim(),
      sku: sku.trim() || null,
      type,
      unit: resolvedUnit,
      cost_per_unit: parseFloat(costPerUnit.replace(/\./g, '').replace(',', '.')) || 0,
      notes: notes.trim() || null,
    }

    try {
      const url = isEdit ? `/api/inventory/items/${item!.id}` : '/api/inventory/items'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { item?: Item; error?: string }
      if (!res.ok) { setError(data.error ?? 'Terjadi kesalahan'); return }
      onSaved(data.item!)
      onClose()
    } catch {
      setError('Gagal menyimpan. Cek koneksi internet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? 'Edit Item' : 'Tambah Item Baru'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Perbarui informasi item inventori.' : 'Tambahkan bahan mentah, setengah jadi, atau barang jadi ke inventori.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tipe */}
          <div className="space-y-1.5">
            <Label htmlFor="item-type">Tipe Item <span className="text-destructive">*</span></Label>
            <Select value={type} onValueChange={(v) => { if (v) setType(v as ItemType) }}>
              <SelectTrigger id="item-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ITEM_TYPE_LABELS) as [ItemType, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nama */}
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Nama Item <span className="text-destructive">*</span></Label>
            <Input
              id="item-name"
              placeholder="cth. Tepung Terigu, Kardus 20x20, Kopi Robusta"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <Label htmlFor="item-sku">SKU / Kode Internal <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Input
              id="item-sku"
              placeholder="cth. BHN-001, PKG-KARDUS-SM"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>

          {/* Satuan */}
          <div className="space-y-1.5">
            <Label>Satuan <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Select value={unit} onValueChange={(v) => { if (v) setUnit(v) }}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                  <SelectItem value="custom">Lainnya...</SelectItem>
                </SelectContent>
              </Select>
              {unit === 'custom' && (
                <Input
                  className="flex-1"
                  placeholder="Tulis satuan"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Harga per unit */}
          <div className="space-y-1.5">
            <Label htmlFor="item-cost">
              Harga per {resolvedUnit}
              <span className="text-muted-foreground text-xs ml-1">(manual/fallback)</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
              <Input
                id="item-cost"
                className="pl-8"
                placeholder="0"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Dipakai untuk kalkulasi HPP jika belum ada harga dari Purchase Order.
            </p>
          </div>

          {/* Catatan */}
          <div className="space-y-1.5">
            <Label htmlFor="item-notes">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Textarea
              id="item-notes"
              placeholder="cth. Supplier: Toko Budi, min order 10kg"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEdit ? 'Simpan Perubahan' : 'Tambah Item'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
