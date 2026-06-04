'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Pencil, Trash2, Loader2, ClipboardList,
  AlertTriangle, CheckCircle2, Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'

interface BomItem {
  id: string
  name: string | null
  output_qty: number
  is_active: boolean
  hpp_per_unit: number
  has_cycle: boolean
  line_count: number
  created_at: string
  output_item: { id: string; name: string; type: string; unit: string } | null
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

export default function BomListPage() {
  const [boms, setBoms] = useState<BomItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BomItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const fetchBoms = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/inventory/bom?${params}`)
      const data = await res.json() as { boms?: BomItem[] }
      setBoms(data.boms ?? [])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchBoms, 300)
    return () => clearTimeout(t)
  }, [fetchBoms])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/inventory/bom/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setDeleteError(data.error ?? 'Gagal menghapus'); return }
      setBoms((prev) => prev.filter((b) => b.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Formula (Resep Produksi)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Definisikan resep produk — HPP dihitung otomatis dari biaya bahan.
          </p>
        </div>
        <Link href="/dashboard/inventory/bom/new">
          <Button className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Buat Formula Baru
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nama produk atau formula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Memuat Formula...
        </div>
      ) : boms.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Tidak ada formula yang cocok.' : 'Belum ada formula. Klik "Buat Formula Baru" untuk memulai.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {boms.map((bom) => (
            <Card key={bom.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-purple-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {bom.name ?? bom.output_item?.name ?? 'Formula tanpa nama'}
                      </p>
                      {!bom.is_active && (
                        <Badge variant="secondary" className="text-[10px]">Nonaktif</Badge>
                      )}
                      {bom.has_cycle && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Cycle!
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Output: <span className="font-medium text-foreground">{bom.output_item?.name ?? '—'}</span>
                      {' · '}{bom.output_qty} {bom.output_item?.unit ?? 'unit'} per proses
                      {' · '}{bom.line_count} bahan
                    </p>

                    <div className="flex items-center gap-4 pt-1">
                      {bom.has_cycle ? (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Ada circular reference — perbaiki formula
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-primary flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          HPP: {formatRp(bom.hpp_per_unit)} / {bom.output_item?.unit ?? 'unit'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Link href={`/dashboard/inventory/bom/${bom.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => { setDeleteTarget(bom); setDeleteError(null) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats */}
      {!loading && boms.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {boms.length} Formula · {boms.filter((b) => b.has_cycle).length > 0
            ? `${boms.filter((b) => b.has_cycle).length} dengan cycle error`
            : 'Semua valid ✓'}
        </p>
      )}

      {/* Delete confirm */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Formula?</AlertDialogTitle>
            <AlertDialogDescription>
              Formula untuk <span className="font-semibold">{deleteTarget?.output_item?.name ?? deleteTarget?.name}</span> akan dihapus permanen beserta semua baris bahannya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg -mt-2">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
