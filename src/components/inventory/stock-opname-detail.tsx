'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, AlertTriangle, Save, Lock, Loader2,
  TrendingUp, TrendingDown, Minus, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { StockOpnameSession, StockOpnameLine } from '@/types'

function formatQty(n: number | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 })
}

interface LineEdit {
  actual_qty: string   // string saat edit, kosong = belum diisi
  notes: string
}

interface Props {
  session: StockOpnameSession & { lines: (StockOpnameLine & { item?: { id: string; name: string; unit: string; type: string; sku: string | null } | null })[] }
}

export function StockOpnameDetail({ session }: Props) {
  const router = useRouter()
  const isFinalized = session.status === 'finalized'

  // State edits per line id
  const [edits, setEdits] = useState<Record<string, LineEdit>>(() => {
    const init: Record<string, LineEdit> = {}
    for (const l of session.lines ?? []) {
      init[l.id] = {
        actual_qty: l.actual_qty != null ? String(l.actual_qty) : '',
        notes: l.notes ?? '',
      }
    }
    return init
  })

  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<'all' | 'filled' | 'empty' | 'diff'>('all')
  const [saving, setSaving]         = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // Derived: lines dengan kalkulasi diff
  const lines = (session.lines ?? []).map((l) => {
    const edit = edits[l.id]
    const actualRaw = edit?.actual_qty ?? ''
    const actual = actualRaw !== '' ? parseFloat(actualRaw) : null
    const diff   = actual != null ? actual - Number(l.system_qty) : null
    return { ...l, editActual: actual, editDiff: diff, editStr: actualRaw }
  })

  const filtered = lines.filter((l) => {
    if (search) {
      const q = search.toLowerCase()
      if (!l.item?.name.toLowerCase().includes(q) && !l.item?.sku?.toLowerCase().includes(q)) return false
    }
    if (filter === 'filled')  return l.editActual != null
    if (filter === 'empty')   return l.editActual == null
    if (filter === 'diff')    return l.editDiff != null && l.editDiff !== 0
    return true
  })

  const stats = {
    total:   lines.length,
    filled:  lines.filter((l) => l.editActual != null).length,
    withDiff: lines.filter((l) => l.editDiff != null && l.editDiff !== 0).length,
  }

  const handleQtyChange = useCallback((id: string, val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], actual_qty: val.replace(/[^0-9.,]/g, '') } }))
  }, [])

  const handleNotesChange = useCallback((id: string, val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], notes: val } }))
  }, [])

  // Simpan semua edits ke server
  const handleSave = async () => {
    setSaving(true)
    try {
      const linesPayload = Object.entries(edits).map(([id, e]) => ({
        id,
        actual_qty: e.actual_qty !== '' ? parseFloat(e.actual_qty.replace(',', '.')) : null,
        notes:      e.notes.trim() || null,
      }))
      const res = await fetch(`/api/inventory/stock-opname/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: linesPayload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan')
      toast.success('Hasil hitungan berhasil disimpan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  // Finalisasi opname
  const handleFinalize = async () => {
    if (!confirm(`Finalisasi opname "${session.name}"?\n\nSelisih stok akan dicatat sebagai penyesuaian otomatis. Sesi tidak bisa diubah setelah difinalisasi.`)) return

    // Simpan dulu sebelum finalisasi
    setFinalizing(true)
    try {
      // Save current edits first
      const linesPayload = Object.entries(edits).map(([id, e]) => ({
        id,
        actual_qty: e.actual_qty !== '' ? parseFloat(e.actual_qty.replace(',', '.')) : null,
        notes:      e.notes.trim() || null,
      }))
      await fetch(`/api/inventory/stock-opname/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: linesPayload }),
      })

      // Finalize
      const res  = await fetch(`/api/inventory/stock-opname/${session.id}/finalize`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal finalisasi')

      const { adjustmentCount } = json.data
      toast.success(
        adjustmentCount > 0
          ? `Opname selesai! ${adjustmentCount} penyesuaian stok dicatat.`
          : 'Opname selesai! Tidak ada selisih stok.'
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Item</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-blue-600">{stats.filled}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sudah Dihitung</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className={`text-2xl font-bold tabular-nums ${stats.withDiff > 0 ? 'text-orange-500' : 'text-green-600'}`}>
            {stats.withDiff}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Ada Selisih</p>
        </div>
      </div>

      {/* Finalized badge */}
      {isFinalized && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">
            Opname telah difinalisasi pada{' '}
            {session.finalized_at
              ? new Date(session.finalized_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—'
            }
          </p>
        </div>
      )}

      {/* Action buttons */}
      {!isFinalized && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || finalizing} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Simpan Draft
          </Button>
          <Button
            size="sm"
            onClick={handleFinalize}
            disabled={saving || finalizing || stats.filled === 0}
            className="gap-1.5 bg-green-600 hover:bg-green-700"
          >
            {finalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            Finalisasi Opname
          </Button>
          {stats.filled === 0 && (
            <p className="text-xs text-muted-foreground self-center">Isi minimal 1 item dulu</p>
          )}
        </div>
      )}

      {/* Filter & search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau SKU..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'filled', 'empty', 'diff'] as const).map((f) => {
            const labels = { all: 'Semua', filled: 'Sudah', empty: 'Belum', diff: 'Selisih' }
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                }`}
              >
                {labels[f]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lines table */}
      <div className="rounded-xl border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_80px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
          <span>Item</span>
          <span className="text-right">Sistem</span>
          <span className="text-right">Fisik</span>
          <span className="text-right">Selisih</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Tidak ada item.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((line) => {
              const diff = line.editDiff
              const hasDiff = diff != null && diff !== 0
              return (
                <div
                  key={line.id}
                  className={`px-4 py-3 ${hasDiff ? 'bg-orange-50/50' : ''}`}
                >
                  <div className="grid grid-cols-[1fr_100px_100px_80px] gap-2 items-center">
                    {/* Item info */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{line.item?.name ?? line.item_id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {line.item?.unit}
                        {line.item?.sku ? ` · ${line.item.sku}` : ''}
                      </p>
                    </div>

                    {/* Sistem qty */}
                    <p className="text-sm text-right tabular-nums text-muted-foreground">
                      {formatQty(line.system_qty)}
                    </p>

                    {/* Fisik input */}
                    <div className="flex justify-end">
                      {isFinalized ? (
                        <span className="text-sm font-medium tabular-nums">
                          {formatQty(line.actual_qty)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="—"
                          value={edits[line.id]?.actual_qty ?? ''}
                          onChange={(e) => handleQtyChange(line.id, e.target.value)}
                          className="h-8 w-24 text-right text-sm px-2"
                        />
                      )}
                    </div>

                    {/* Selisih */}
                    <div className="flex justify-end">
                      {diff == null ? (
                        <span className="text-muted-foreground/40 text-sm">—</span>
                      ) : diff === 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                          <Minus className="h-3 w-3" /> 0
                        </span>
                      ) : diff > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 font-medium tabular-nums">
                          <TrendingUp className="h-3 w-3" /> +{formatQty(diff)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium tabular-nums">
                          <TrendingDown className="h-3 w-3" /> {formatQty(diff)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notes input (hanya jika ada selisih atau sudah ada catatan) */}
                  {!isFinalized && hasDiff && (
                    <div className="mt-2">
                      <Input
                        placeholder="Catatan selisih (opsional)..."
                        value={edits[line.id]?.notes ?? ''}
                        onChange={(e) => handleNotesChange(line.id, e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                  {isFinalized && line.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{line.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary warning jika ada selisih */}
      {!isFinalized && stats.withDiff > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-orange-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-sm">
            <span className="font-semibold">{stats.withDiff} item</span> memiliki selisih.
            Saat finalisasi, selisih akan dicatat otomatis sebagai transaksi penyesuaian stok.
          </p>
        </div>
      )}
    </div>
  )
}
