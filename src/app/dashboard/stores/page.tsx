'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Plus,
  Store as StoreIcon,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react'
import type { Store } from '@/types'
import { trackEvent } from '@/lib/analytics'
import { MARKETPLACE_OPTIONS } from '@/lib/constants/marketplace-fees'

type DialogMode = 'create' | 'edit' | null

export default function StoresPage() {
  const searchParams = useSearchParams()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [formName, setFormName] = useState('')
  const [formMarketplace, setFormMarketplace] = useState('shopee')
  const [formNotes, setFormNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadStores() {
    setLoading(true)
    const res = await fetch('/api/stores')
    const data = await res.json()
    setStores(data.stores ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadStores()
  }, [])

  // Auto-open create dialog if ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    trackEvent('store_dialog_opened', { mode: 'create' })
    setDialogMode('create')
    setEditingStore(null)
    setFormName('')
    setFormMarketplace('shopee')
    setFormNotes('')
    setError(null)
  }

  function openEdit(store: Store) {
    trackEvent('store_dialog_opened', { mode: 'edit', marketplace: store.marketplace })
    setDialogMode('edit')
    setEditingStore(store)
    setFormName(store.name)
    setFormMarketplace(store.marketplace)
    setFormNotes(store.notes ?? '')
    setError(null)
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingStore(null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setError('Nama toko wajib diisi')
      return
    }
    setSubmitting(true)
    setError(null)

    const mode = dialogMode === 'edit' ? 'edit' : 'create'
    const payload = {
      name: formName.trim(),
      marketplace: formMarketplace,
      notes: formNotes.trim() || null,
    }

    trackEvent('store_save_attempt', {
      mode,
      marketplace: formMarketplace,
    })

    const url =
      dialogMode === 'edit' && editingStore
        ? `/api/stores/${editingStore.id}`
        : '/api/stores'
    const method = dialogMode === 'edit' ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!res.ok) {
      trackEvent('store_save_failed', {
        mode,
        marketplace: formMarketplace,
      })
      setError(data.error ?? 'Gagal menyimpan toko')
      setSubmitting(false)
      return
    }

    trackEvent(dialogMode === 'edit' ? 'store_updated' : 'store_created', {
      marketplace: formMarketplace,
    })
    setSubmitting(false)
    closeDialog()
    await loadStores()
  }

  async function handleDelete(store: Store) {
    if (
      !confirm(
        `Hapus toko "${store.name}"?\n\nSemua data (orders, ads, produk, upload) milik toko ini akan ikut terhapus. Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return
    }

    trackEvent('store_delete_confirmed', {
      marketplace: store.marketplace,
    })

    setDeletingId(store.id)
    const res = await fetch(`/api/stores/${store.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      trackEvent('store_delete_failed', {
        marketplace: store.marketplace,
      })
      alert(`Gagal menghapus: ${data.error}`)
    } else {
      trackEvent('store_deleted', {
        marketplace: store.marketplace,
      })
      await loadStores()
    }
    setDeletingId(null)
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Toko Saya</h1>
          <p className="text-muted-foreground mt-1">
            Kelola toko yang kamu miliki atau yang dibagikan ke akunmu. Semua data upload akan dipisahkan per toko.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Toko
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Memuat toko...
        </div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <StoreIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Belum ada toko</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Tambah toko pertama kamu untuk mulai upload data.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Tambah Toko Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.map((store) => (
            <Card key={store.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <StoreIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{store.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground uppercase">
                          {store.marketplace}
                        </p>
                        {!store.can_manage && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Shared Access
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {store.can_manage && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(store)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(store)}
                        disabled={deletingId === store.id}
                      >
                        {deletingId === store.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
                {store.notes && (
                  <p className="text-sm text-muted-foreground border-t pt-2">
                    {store.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Pakai switcher di pojok atas untuk pindah antar toko atau lihat gabungan semua
          toko yang bisa kamu akses.
        </AlertDescription>
      </Alert>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? 'Edit Toko' : 'Tambah Toko Baru'}
            </DialogTitle>
            <DialogDescription>
              Beri nama toko yang mudah kamu ingat. Contoh: &quot;Toko A Shopee&quot;,
              &quot;Outlet Surabaya&quot;.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div>
              <Label htmlFor="name">Nama Toko *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Contoh: Toko Utama"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="marketplace">Marketplace *</Label>
              <Select value={formMarketplace} onValueChange={(v) => v && setFormMarketplace(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Catatan (opsional)</Label>
              <Input
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Misal: Toko untuk produk fashion"
                className="mt-1"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : dialogMode === 'edit' ? (
                  'Simpan'
                ) : (
                  'Tambah Toko'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
