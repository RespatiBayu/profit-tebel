'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Trash2, CheckCircle } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

type ResetType = 'income' | 'orders_all' | 'ads_summary' | 'ads_product'

const OPTIONS: { id: ResetType; label: string; desc: string }[] = [
  { id: 'income',      label: 'Data Penghasilan',           desc: 'Tabel orders (dari file income XLSX yang dananya sudah dilepas)' },
  { id: 'orders_all',  label: 'Semua Order',                 desc: 'Tabel orders_all + order_products (dari file Order.all — termasuk mapping SKU)' },
  { id: 'ads_summary', label: 'Data Iklan (Summary)',        desc: 'Baris Summary per Iklan dari file ads CSV' },
  { id: 'ads_product', label: 'Data per Produk (GMV Max Auto)', desc: 'Baris per-produk dari file ads CSV GMV Max Auto' },
]

interface Props {
  storeId: string | null
  onSuccess?: () => void
}

export function ResetDataDialog({ storeId, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<ResetType>>(new Set())
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ summary: string; totalDeleted: number } | null>(null)

  function toggle(id: ResetType) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setSelected(new Set())
    setConfirmation('')
    setError(null)
    setResult(null)
    setLoading(false)
  }

  async function handleDelete() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: Array.from(selected),
          confirmation,
          storeId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        trackEvent('reset_data_failed', {
          selected_types_count: selected.size,
        })
        setError(json.error ?? `HTTP ${res.status}`)
      } else {
        trackEvent('reset_data_completed', {
          selected_types_count: selected.size,
          total_deleted: json.totalDeleted,
        })
        setResult({ summary: json.summary, totalDeleted: json.totalDeleted })
        onSuccess?.()
      }
    } catch (err) {
      trackEvent('reset_data_failed', {
        selected_types_count: selected.size,
      })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const canDelete = selected.size > 0 && confirmation.trim().toLowerCase() === 'delete' && !loading

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
        onClick={() => {
          trackEvent('reset_data_opened')
          setOpen(true)
        }}
      >
        <Trash2 className="h-4 w-4" />
        Reset Data
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) {
            // Delay reset so closing animation looks clean
            setTimeout(reset, 200)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-5 w-5" />
            Reset Data
          </DialogTitle>
          <DialogDescription>
            Pilih jenis data yang ingin dihapus. Aksi ini <strong>tidak dapat dibatalkan</strong>.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Berhasil menghapus {result.totalDeleted} baris.
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words">
              {result.summary}
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false)
                  // Hard refresh to ensure dashboards pick up the cleared state
                  setTimeout(() => window.location.reload(), 100)
                }}
              >
                Tutup &amp; Refresh
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {OPTIONS.map((opt) => {
                const checked = selected.has(opt.id)
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      checked ? 'border-red-300 bg-red-50' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.id)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-red-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {selected.size > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm">
                  Ketik <code className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono text-xs">delete</code> untuk konfirmasi:
                </p>
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="ketik delete..."
                  className="font-mono"
                  autoFocus
                />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Batal
              </Button>
              <Button
                onClick={handleDelete}
                disabled={!canDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? 'Menghapus...' : `Hapus ${selected.size} jenis data`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  )
}
