'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface AdjustmentDialogProps {
  item: { id: string; name: string; unit: string; qty_on_hand: number }
  onClose: () => void
  onSaved: () => void
}

export function AdjustmentDialog({ item, onClose, onSaved }: AdjustmentDialogProps) {
  const [mode, setMode]     = useState<'add' | 'subtract'>('add')
  const [qty, setQty]       = useState('')
  const [notes, setNotes]   = useState('')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const numQty = parseFloat(qty)
    if (!numQty || numQty <= 0) {
      toast.error('Qty harus lebih dari 0')
      return
    }
    const finalQty = mode === 'subtract' ? -numQty : numQty

    setLoading(true)
    try {
      const res = await fetch('/api/inventory/stock/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, qty: finalQty, notes: notes || null, date }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan')
      toast.success('Penyesuaian stok berhasil disimpan')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Koreksi Stok</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm flex justify-between">
          <span className="text-muted-foreground">Stok saat ini</span>
          <span className="font-semibold tabular-nums">
            {Number(item.qty_on_hand).toLocaleString('id-ID', { maximumFractionDigits: 2 })} {item.unit}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'add'
                  ? 'bg-green-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              + Tambah
            </button>
            <button
              type="button"
              onClick={() => setMode('subtract')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'subtract'
                  ? 'bg-red-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              − Kurangi
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Jumlah ({item.unit})</Label>
            <Input
              type="number"
              min="0.0001"
              step="any"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tanggal</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Keterangan (opsional)</Label>
            <Textarea
              placeholder="Alasan penyesuaian..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Menyimpan...' : 'Simpan Penyesuaian'}
          </Button>
        </form>
      </div>
    </div>
  )
}
