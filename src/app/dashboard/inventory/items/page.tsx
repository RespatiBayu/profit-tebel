'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Search, Pencil, Trash2, Loader2, Package,
  FlaskConical, Boxes, ShoppingBag, Filter, PackageSearch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ItemFormDrawer } from '@/components/inventory/item-form-drawer'
import { ImportMasterDialog } from '@/components/inventory/import-master-dialog'
import type { Item, ItemType } from '@/types'

const TYPE_CONFIG: Record<ItemType, { label: string; icon: React.ElementType; variant: string }> = {
  raw_material:   { label: 'Bahan Mentah',        icon: FlaskConical, variant: 'secondary' },
  semi_finished:  { label: 'Setengah Jadi',        icon: Package,      variant: 'outline'   },
  finished_good:  { label: 'Barang Jadi',           icon: ShoppingBag,  variant: 'default'   },
}

const FILTER_OPTIONS: { label: string; value: ItemType | 'all' }[] = [
  { label: 'Semua', value: 'all' },
  { label: 'Bahan Mentah', value: 'raw_material' },
  { label: 'Setengah Jadi', value: 'semi_finished' },
  { label: 'Barang Jadi', value: 'finished_good' },
]

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function TypeBadge({ type }: { type: ItemType }) {
  const cfg = TYPE_CONFIG[type]
  const Icon = cfg.icon
  return (
    <Badge variant={cfg.variant as 'default' | 'secondary' | 'outline'} className="gap-1.5 font-normal">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  )
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/inventory/items?${params}`)
      const data = await res.json() as { items?: Item[] }
      setItems(data.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    const t = setTimeout(fetchItems, 300)
    return () => clearTimeout(t)
  }, [fetchItems])

  function handleSaved(saved: Item) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...saved }
        return next
      }
      return [saved, ...prev]
    })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/inventory/items/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setDeleteError(data.error ?? 'Gagal menghapus'); return }
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  const activeFilterLabel = FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label ?? 'Semua'

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Master Item
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola bahan mentah, barang setengah jadi, dan barang jadi.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <PackageSearch className="h-4 w-4" />
            Import dari Mapping Produk
          </Button>
          <Button onClick={() => { setEditItem(null); setDrawerOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            Tambah Item
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nama atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 shrink-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <Filter className="h-4 w-4" />
            {activeFilterLabel}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {FILTER_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                className={typeFilter === opt.value ? 'font-semibold text-primary' : ''}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nama</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead className="text-right">Harga Manual</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Memuat data...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Boxes className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {search || typeFilter !== 'all' ? 'Tidak ada item yang cocok.' : 'Belum ada item. Klik "Tambah Item" untuk mulai.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">
                    {item.sku ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell><TypeBadge type={item.type} /></TableCell>
                  <TableCell className="text-sm">{item.unit}</TableCell>
                  <TableCell className="text-right text-sm">
                    {item.cost_per_unit > 0 ? formatRp(item.cost_per_unit) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {(item.qty_on_hand ?? 0) !== 0
                      ? <span className={(item.qty_on_hand ?? 0) < 0 ? 'text-destructive' : ''}>{item.qty_on_hand} {item.unit}</span>
                      : <span className="text-muted-foreground/40">0</span>
                    }
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {item.avg_cost != null ? formatRp(item.avg_cost) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditItem(item); setDrawerOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { setDeleteTarget(item); setDeleteError(null) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stats */}
      {!loading && items.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {items.length} item • {items.filter((i) => i.type === 'raw_material').length} bahan mentah •{' '}
          {items.filter((i) => i.type === 'semi_finished').length} setengah jadi •{' '}
          {items.filter((i) => i.type === 'finished_good').length} barang jadi
        </p>
      )}

      {/* Add/Edit Drawer */}
      <ItemFormDrawer
        open={drawerOpen}
        item={editItem}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />

      {/* Import dari Mapping Produk */}
      <ImportMasterDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchItems}
      />

      {/* Delete Confirm */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v: boolean) => { if (!v) { setDeleteTarget(null); setDeleteError(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Item <span className="font-semibold">{deleteTarget?.name}</span> akan dihapus permanen.
              Item yang sudah memiliki transaksi stok atau digunakan di Formula tidak dapat dihapus.
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
