'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, PackageSearch, Link2, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { MasterProduct } from '@/types'

interface ImportMasterDialogProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

function formatRp(n: number) {
  return 'Rp ' + (n ?? 0).toLocaleString('id-ID')
}

export function ImportMasterDialog({ open, onClose, onImported }: ImportMasterDialogProps) {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<MasterProduct[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/master-products')
      const data = await res.json() as { products?: MasterProduct[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Gagal memuat produk'); return }
      setProducts(data.products ?? [])
    } catch {
      setError('Gagal memuat produk. Cek koneksi internet.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setQ('')
      fetchProducts()
    }
  }, [open, fetchProducts])

  if (!open) return null

  const term = q.trim().toLowerCase()
  const filtered = products.filter((p) => {
    if (!term) return true
    return (
      p.product_name?.toLowerCase().includes(term) ||
      p.marketplace_product_id?.toLowerCase().includes(term) ||
      (p.seller_sku ?? '').toLowerCase().includes(term)
    )
  })

  const importable = filtered.filter((p) => !p.linked_item_id)
  const allImportableSelected = importable.length > 0 && importable.every((p) => selected.has(p.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allImportableSelected) {
        const next = new Set(prev)
        importable.forEach((p) => next.delete(p.id))
        return next
      }
      const next = new Set(prev)
      importable.forEach((p) => next.add(p.id))
      return next
    })
  }

  async function handleImport() {
    if (selected.size === 0) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/inventory/items/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: Array.from(selected) }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Gagal mengimpor'); return }
      onImported()
      onClose()
    } catch {
      setError('Gagal mengimpor. Cek koneksi internet.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!importing) onClose() }}
      />

      {/* Panel */}
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[520px] flex flex-col bg-background rounded-t-2xl sm:rounded-none shadow-2xl border-t sm:border-t-0 sm:border-l max-h-[92dvh] sm:max-h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold text-base leading-none flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary" />
              Import dari Mapping Produk
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5">
              Pilih produk untuk dijadikan item “Barang Jadi”. Item akan otomatis ter-link ke produk
              sehingga HPP dari resep produksi tersinkron ke analisis profit.
            </p>
          </div>
          <button
            onClick={() => { if (!importing) onClose() }}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + select all */}
        <div className="px-5 py-3 border-b shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Cari nama, kode, atau SKU..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {importable.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allImportableSelected ? 'Batalkan semua' : `Pilih semua (${importable.length})`}
              </button>
              <span className="text-xs text-muted-foreground">{selected.size} dipilih</span>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Memuat produk...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <PackageSearch className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              {products.length === 0
                ? 'Belum ada Mapping Produk. Isi HPP di menu Mapping Produk dulu.'
                : 'Tidak ada produk yang cocok.'}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((p) => {
                const isLinked = Boolean(p.linked_item_id)
                const isSelected = selected.has(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={isLinked}
                      onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isLinked
                          ? 'border-border bg-muted/40 cursor-default'
                          : isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isLinked
                            ? 'border-transparent'
                            : isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input'
                        }`}
                      >
                        {isLinked ? (
                          <Link2 className="h-3.5 w-3.5 text-primary" />
                        ) : isSelected ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.product_name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {p.seller_sku || p.marketplace_product_id}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {isLinked ? (
                          <Badge variant="outline" className="gap-1 font-normal text-[10px]">
                            <Link2 className="h-2.5 w-2.5" /> Sudah di-link
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {p.hpp > 0 ? formatRp(p.hpp) : '—'}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-5 py-4 flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-10" onClick={onClose} disabled={importing}>
            Batal
          </Button>
          <Button
            type="button"
            className="flex-1 h-10"
            onClick={handleImport}
            disabled={importing || selected.size === 0}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </>
  )
}
