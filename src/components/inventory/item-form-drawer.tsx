'use client'

import { useEffect, useState } from 'react'
import { Loader2, FlaskConical, Package, ShoppingBag, X } from 'lucide-react'
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

const ITEM_TYPES: { value: ItemType; label: string; desc: string; icon: React.ElementType; color: string; bg: string }[] = [
  { value: 'raw_material',  label: 'Bahan Mentah',  desc: 'Bahan baku produksi', icon: FlaskConical, color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-200'   },
  { value: 'semi_finished', label: 'Setengah Jadi', desc: 'Produk antara',        icon: Package,      color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  { value: 'finished_good', label: 'Barang Jadi',   desc: 'Siap dijual',          icon: ShoppingBag,  color: 'text-green-600',  bg: 'bg-green-50  border-green-200'  },
]

const COMMON_UNITS = ['pcs', 'kg', 'gram', 'liter', 'ml', 'lusin', 'karton', 'roll', 'lembar', 'botol', 'sachet']

interface ItemFormDrawerProps {
  open: boolean
  item?: Item | null
  onClose: () => void
  onSaved: (item: Item) => void
}

export function ItemFormDrawer({ open, item, onClose, onSaved }: ItemFormDrawerProps) {
  const isEdit = Boolean(item)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [name, setName]             = useState('')
  const [sku, setSku]               = useState('')
  const [type, setType]             = useState<ItemType>('raw_material')
  const [unit, setUnit]             = useState('pcs')
  const [customUnit, setCustomUnit] = useState('')
  const [costPerUnit, setCostPerUnit]   = useState('')
  const [minStockQty, setMinStockQty]   = useState('')
  const [notes, setNotes]               = useState('')

  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name)
        setSku(item.sku ?? '')
        setType(item.type)
        const isCommon = COMMON_UNITS.includes(item.unit)
        setUnit(isCommon ? item.unit : 'custom')
        setCustomUnit(isCommon ? '' : item.unit)
        setCostPerUnit(item.cost_per_unit > 0 ? String(item.cost_per_unit) : '')
        setMinStockQty(item.min_stock_qty > 0 ? String(item.min_stock_qty) : '')
        setNotes(item.notes ?? '')
      } else {
        setName(''); setSku(''); setType('raw_material')
        setUnit('pcs'); setCustomUnit(''); setCostPerUnit('')
        setMinStockQty(''); setNotes('')
      }
      setError(null)
    }
  }, [item, open])

  const resolvedUnit = unit === 'custom' ? customUnit.trim() || 'pcs' : unit

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nama item wajib diisi'); return }
    if (unit === 'custom' && !customUnit.trim()) { setError('Satuan kustom wajib diisi'); return }

    setLoading(true)
    setError(null)
    try {
      const url    = isEdit ? `/api/inventory/items/${item!.id}` : '/api/inventory/items'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          type,
          unit: resolvedUnit,
          cost_per_unit: parseFloat(costPerUnit.replace(/\./g, '').replace(',', '.')) || 0,
          min_stock_qty: parseFloat(minStockQty.replace(',', '.')) || 0,
          notes: notes.trim() || null,
        }),
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

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!loading) onClose() }}
      />

      {/* Panel — full bottom sheet on mobile, right panel on desktop */}
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] flex flex-col bg-background rounded-t-2xl sm:rounded-none shadow-2xl border-t sm:border-t-0 sm:border-l max-h-[92dvh] sm:max-h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold text-base leading-none">
              {isEdit ? 'Edit Item' : 'Tambah Item Baru'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isEdit ? 'Perbarui informasi item inventori.' : 'Isi detail item yang ingin ditambahkan.'}
            </p>
          </div>
          <button
            onClick={() => { if (!loading) onClose() }}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <form id="item-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Tipe Item — card selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Tipe Item <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {ITEM_TYPES.map((t) => {
                const Icon = t.icon
                const selected = type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setType(t.value)
                      if (t.value !== 'raw_material') setCostPerUnit('')
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all text-center ${
                      selected
                        ? `${t.bg} ${t.color} border-current shadow-sm`
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${selected ? t.color : 'text-muted-foreground'}`} />
                    <span className="text-[11px] font-medium leading-tight">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{t.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nama Item */}
          <div className="space-y-1.5">
            <Label htmlFor="item-name" className="text-sm font-medium">
              Nama Item <span className="text-destructive">*</span>
            </Label>
            <Input
              id="item-name"
              placeholder="cth. Tepung Terigu, Kardus 20x20, Kopi Robusta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <Label htmlFor="item-sku" className="text-sm font-medium">
              SKU / Kode Internal
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="item-sku"
              placeholder="cth. BHN-001, PKG-KARDUS-SM"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Satuan */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Satuan <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Select value={unit} onValueChange={(v) => { if (v) setUnit(v) }}>
                <SelectTrigger className="h-10 flex-1">
                  <SelectValue placeholder="Pilih satuan" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                  <SelectItem value="custom">Lainnya (ketik sendiri)...</SelectItem>
                </SelectContent>
              </Select>
              {unit === 'custom' && (
                <Input
                  className="h-10 flex-1"
                  placeholder="Satuan kustom"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Harga manual — hanya untuk Bahan Mentah */}
          {type === 'raw_material' ? (
            <div className="space-y-1.5">
              <Label htmlFor="item-cost" className="text-sm font-medium">
                Harga per {resolvedUnit}
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(manual/fallback)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">Rp</span>
                <Input
                  id="item-cost"
                  className="pl-9 h-10"
                  placeholder="0"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Dipakai untuk kalkulasi HPP jika belum ada harga dari Purchase Order.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/60 border border-border px-4 py-3 flex items-start gap-2.5">
              <span className="text-base mt-0.5">⚙️</span>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Harga otomatis dari BOM
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  HPP {type === 'semi_finished' ? 'barang setengah jadi' : 'barang jadi'} dihitung otomatis
                  saat proses produksi selesai berdasarkan Formula (Resep Produksi) yang sudah dikonfigurasi.
                </p>
              </div>
            </div>
          )}

          {/* Stok minimum */}
          <div className="space-y-1.5">
            <Label htmlFor="item-min-stock" className="text-sm font-medium">
              Stok Minimum
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <div className="relative">
              <Input
                id="item-min-stock"
                className="h-10 pr-12"
                placeholder="0"
                value={minStockQty}
                onChange={(e) => setMinStockQty(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                {resolvedUnit}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Alert muncul jika stok tersedia ≤ angka ini.
            </p>
          </div>

          {/* Catatan */}
          <div className="space-y-1.5">
            <Label htmlFor="item-notes" className="text-sm font-medium">
              Catatan
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <Textarea
              id="item-notes"
              placeholder="cth. Supplier: Toko Budi, min order 10kg"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Sticky footer */}
        <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-5 py-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-10"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="item-form"
            className="flex-1 h-10"
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Simpan Perubahan' : 'Tambah Item'}
          </Button>
        </div>
      </div>
    </>
  )
}
