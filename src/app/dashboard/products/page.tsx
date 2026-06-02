'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Package,
  Search,
  Save,
  AlertCircle,
  CheckCircle,
  ArrowUpDown,
  Upload,
  Trash2,
  Link2,
  X,
  Download,
  FileUp,
} from 'lucide-react'
import { DashboardLink } from '@/components/layout/dashboard-link'
import type { MasterProduct, MasterProductSourceTag, Item } from '@/types'

// Inline item link picker per row
function ItemLinkPicker({
  productId,
  linkedItemId,
  linkedItemName,
  onLinked,
}: {
  productId: string
  linkedItemId?: string | null
  linkedItemName?: string | null
  onLinked: (itemId: string | null, itemName: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const search = useCallback(async (query: string) => {
    const params = new URLSearchParams({ q: query || '' })
    const res = await fetch(`/api/inventory/items?${params}`)
    const data = await res.json() as { items?: Item[] }
    setItems((data.items ?? []).filter((i) => i.type !== 'raw_material'))
  }, [])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => search(q), 200)
      return () => clearTimeout(t)
    }
  }, [q, open, search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function saveLink(itemId: string | null, itemName: string | null) {
    setSaving(true)
    try {
      await fetch(`/api/master-products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_item_id: itemId }),
      })
      onLinked(itemId, itemName)
    } finally {
      setSaving(false)
      setOpen(false)
      setQ('')
    }
  }

  if (linkedItemId && linkedItemName && !open) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Link2 className="h-3 w-3 text-primary shrink-0" />
        <span className="text-primary font-medium truncate max-w-[100px]">{linkedItemName}</span>
        <button
          type="button"
          onClick={() => saveLink(null, null)}
          disabled={saving}
          className="text-muted-foreground hover:text-destructive ml-0.5"
          title="Hapus link"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {open ? (
        <>
          <Input
            autoFocus
            placeholder="Cari item..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-7 text-xs w-32"
          />
          <div className="absolute top-full left-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg w-48 max-h-36 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">Tidak ada item</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full text-left px-2 py-1.5 hover:bg-muted/60 text-xs"
                  onMouseDown={(e) => { e.preventDefault(); saveLink(item.id, item.name) }}
                >
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-muted-foreground">{item.type === 'semi_finished' ? 'Setengah Jadi' : 'Barang Jadi'}</p>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-3 w-3" />
          {saving ? 'Menyimpan...' : 'Link item'}
        </button>
      )}
    </div>
  )
}

interface EditingProduct {
  hpp: string
  packaging_cost: string
}

interface MasterProductsResponse {
  products: MasterProduct[]
  error?: string
}

const SOURCE_LABELS: Record<MasterProductSourceTag, string> = {
  income: 'Income',
  orders_all: 'Order.all',
  ads: 'Iklan',
  ads_product: 'Iklan Produk',
}

function isNumericProductId(value: string | null | undefined) {
  return !!value && /^\d+$/.test(value)
}

function buildDraft(product: MasterProduct): EditingProduct {
  return {
    hpp: product.hpp ? String(product.hpp) : '',
    packaging_cost: product.packaging_cost ? String(product.packaging_cost) : '',
  }
}

function parseDraftNumber(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return 0

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function isDraftDirty(product: MasterProduct, draft?: EditingProduct) {
  if (!draft) return false

  const hpp = parseDraftNumber(draft.hpp)
  const packagingCost = parseDraftNumber(draft.packaging_cost)

  if (hpp === null || packagingCost === null) {
    return true
  }

  return hpp !== product.hpp || packagingCost !== product.packaging_cost
}

export default function ProductsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const storeId = searchParams.get('store') ?? ''
  const marketplace = searchParams.get('marketplace') ?? ''
  const [products, setProducts] = useState<MasterProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'hpp'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [drafts, setDrafts] = useState<Record<string, EditingProduct>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  // linked_item overrides per product (keyed by product.id)
  const [linkedOverrides, setLinkedOverrides] = useState<Record<string, { id: string | null; name: string | null }>>({})

  const [bulkUploading, setBulkUploading] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  function handleLinked(productId: string, itemId: string | null, itemName: string | null) {
    setLinkedOverrides((prev) => ({ ...prev, [productId]: { id: itemId, name: itemName } }))
  }

  const scopeParams = useCallback(() => {
    const params = new URLSearchParams()
    if (storeId) params.set('store', storeId)
    if (marketplace) params.set('marketplace', marketplace)
    return params
  }, [storeId, marketplace])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = scopeParams()
      const url = params.size > 0
        ? `/api/master-products?${params.toString()}`
        : '/api/master-products'
      const response = await fetch(url, { cache: 'no-store' })
      const json = await response.json().catch(() => null) as MasterProductsResponse | null

      if (!response.ok) {
        setProducts([])
        setDrafts({})
        setSaved({})
        setError(json?.error ?? 'Gagal mengambil data produk')
        return
      }

      setProducts(json?.products ?? [])
      setDrafts({})
      setSaved({})
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setProducts([])
      setDrafts({})
      setSaved({})
      setError(`Gagal mengambil data produk: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [scopeParams])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  function resetDraft(id: string) {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function updateDraft(product: MasterProduct, patch: Partial<EditingProduct>) {
    setDrafts((prev) => {
      const nextDraft = {
        ...(prev[product.id] ?? buildDraft(product)),
        ...patch,
      }
      const next = { ...prev }

      if (isDraftDirty(product, nextDraft)) {
        next[product.id] = nextDraft
      } else {
        delete next[product.id]
      }

      return next
    })
    setError(null)
    setSuccessMessage(null)
  }

  async function saveAllProducts() {
    const pendingChanges = products.flatMap((product) => {
      const draft = drafts[product.id]
      if (!isDraftDirty(product, draft)) {
        return []
      }

      const hpp = parseDraftNumber(draft?.hpp ?? '')
      const packaging_cost = parseDraftNumber(draft?.packaging_cost ?? '')

      return [{ product, hpp, packaging_cost }]
    })

    if (pendingChanges.length === 0) {
      return
    }

    if (pendingChanges.some((item) => item.hpp === null || item.packaging_cost === null)) {
      setError('Masih ada input HPP atau Packaging yang tidak valid')
      return
    }

    setSavingAll(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/master-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: pendingChanges.map((item) => ({
            id: item.product.id,
            hpp: item.hpp,
            packaging_cost: item.packaging_cost,
          })),
        }),
      })

      const json = await response.json().catch(() => null) as {
        updatedCount?: number
        error?: string
      } | null

      if (!response.ok) {
        setError(`Gagal menyimpan: ${json?.error ?? response.statusText}`)
        return
      }

      const updatedIds = pendingChanges.map((item) => item.product.id)
      const updateMap = new Map(
        pendingChanges.map((item) => [
          item.product.id,
          {
            hpp: item.hpp ?? 0,
            packaging_cost: item.packaging_cost ?? 0,
          },
        ])
      )

      setProducts((prev) =>
        prev.map((product) => {
          const next = updateMap.get(product.id)
          return next ? { ...product, ...next } : product
        })
      )

      setDrafts((prev) => {
        const next = { ...prev }
        updatedIds.forEach((id) => {
          delete next[id]
        })
        return next
      })

      setSaved((prev) => {
        const next = { ...prev }
        updatedIds.forEach((id) => {
          next[id] = true
        })
        return next
      })

      setTimeout(() => {
        setSaved((prev) => {
          const next = { ...prev }
          updatedIds.forEach((id) => {
            delete next[id]
          })
          return next
        })
      }, 2000)

      setSuccessMessage(`${json?.updatedCount ?? pendingChanges.length} produk berhasil disimpan`)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(`Gagal menyimpan: ${message}`)
    } finally {
      setSavingAll(false)
    }
  }

  async function deleteProduct(productId: string) {
    if (!confirm('Apakah kamu yakin ingin menghapus produk ini? Aksi ini tidak bisa dibatalkan.')) {
      return
    }

    setDeleting((prev) => ({ ...prev, [productId]: true }))

    try {
      const response = await fetch(`/api/master-products/${productId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Gagal menghapus produk')
        setDeleting((prev) => ({ ...prev, [productId]: false }))
        return
      }

      // Remove from state
      setProducts((prev) => prev.filter((p) => p.id !== productId))
      resetDraft(productId)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(`Gagal menghapus produk: ${message}`)
      setDeleting((prev) => ({ ...prev, [productId]: false }))
    }
  }

  function downloadTemplate() {
    const params = scopeParams()
    const url = params.size > 0
      ? `/api/master-products/template?${params.toString()}`
      : '/api/master-products/template'
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function handleBulkFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // reset agar file yang sama bisa diupload lagi
    if (!file) return

    setBulkUploading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const params = scopeParams()
      const url = params.size > 0
        ? `/api/master-products/bulk?${params.toString()}`
        : '/api/master-products/bulk'
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(url, { method: 'POST', body: formData })
      const json = await response.json().catch(() => null) as {
        updated?: number
        created?: number
        createBlocked?: string | null
        createBlockedCount?: number
        createFailedCount?: number
        skippedNoNameCount?: number
        invalidRows?: number
        error?: string
      } | null

      if (!response.ok) {
        setError(json?.error ?? 'Gagal memproses file Excel')
        return
      }

      const parts: string[] = []
      parts.push(`${json?.updated ?? 0} produk diperbarui`)
      if (json?.created) parts.push(`${json.created} produk baru ditambahkan`)
      if (json?.createFailedCount) parts.push(`${json.createFailedCount} produk baru gagal dibuat`)
      if (json?.skippedNoNameCount) parts.push(`${json.skippedNoNameCount} baris dilewati (tanpa nama)`)
      if (json?.invalidRows) parts.push(`${json.invalidRows} baris angka tidak valid`)
      setSuccessMessage(parts.join(' · '))

      // Kalau pembuatan produk baru diblokir (banyak toko), tampilkan sebagai peringatan.
      if (json?.createBlocked) {
        setError(`${json.createBlockedCount ?? ''} produk baru belum dibuat: ${json.createBlocked}`.trim())
      }

      await loadProducts()
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(`Gagal upload: ${message}`)
    } finally {
      setBulkUploading(false)
    }
  }

  // Filter + sort
  const filtered = products
    .filter((p) => {
      const q = search.toLowerCase()
      return (
        p.product_name.toLowerCase().includes(q) ||
        p.marketplace_product_id.toLowerCase().includes(q) ||
        (p.seller_sku?.toLowerCase().includes(q) ?? false)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return sortDir === 'asc'
          ? a.product_name.localeCompare(b.product_name)
          : b.product_name.localeCompare(a.product_name)
      }
      return sortDir === 'asc' ? a.hpp - b.hpp : b.hpp - a.hpp
    })

  const noHppCount = products.filter((p) => !p.hpp || p.hpp === 0).length
  const pendingChanges = products.filter((product) => isDraftDirty(product, drafts[product.id]))
  const invalidChanges = pendingChanges.filter((product) => {
    const draft = drafts[product.id]
    return (
      parseDraftNumber(draft?.hpp ?? '') === null ||
      parseDraftNumber(draft?.packaging_cost ?? '') === null
    )
  })

  function toggleSort(col: 'name' | 'hpp') {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  function getDisplayProductId(product: MasterProduct) {
    if (isNumericProductId(product.marketplace_product_id)) return product.marketplace_product_id
    return null
  }

  function getDisplaySellerSku(product: MasterProduct) {
    if (product.seller_sku) return product.seller_sku
    if (!isNumericProductId(product.marketplace_product_id)) return product.marketplace_product_id
    return null
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Master Produk</h1>
          <p className="text-muted-foreground mt-1">
            {products.length} produk terdaftar
            {noHppCount > 0 && (
              <span className="text-orange-600 ml-1">· {noHppCount} belum ada HPP</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={bulkInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleBulkFile}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={downloadTemplate}
            disabled={loading || products.length === 0}
            title={products.length === 0 ? 'Belum ada produk untuk dijadikan template' : 'Unduh template Excel berisi produk & HPP saat ini'}
          >
            <Download className="h-4 w-4" />
            Template Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => bulkInputRef.current?.click()}
            disabled={bulkUploading || loading}
          >
            <FileUp className="h-4 w-4" />
            {bulkUploading ? 'Mengunggah...' : 'Upload Excel'}
          </Button>
          <DashboardLink href="/dashboard/upload">
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data
            </Button>
          </DashboardLink>
        </div>
      </div>

      {/* HPP alert */}
      {noHppCount > 0 && !loading && products.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>{noHppCount} produk</strong> belum diisi HPP-nya. Profit tidak akan akurat sebelum HPP diisi.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      {pendingChanges.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{pendingChanges.length} perubahan</strong> belum disimpan.
            {invalidChanges.length > 0
              ? ` Perbaiki ${invalidChanges.length} baris yang masih belum valid dulu.`
              : ' Kamu bisa isi banyak baris sekaligus lalu klik simpan semua.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Belum ada produk</p>
            <p className="text-sm text-muted-foreground mt-1">
              Produk akan otomatis muncul setelah kamu upload data penghasilan atau iklan.
            </p>
          </div>
          <DashboardLink href="/dashboard/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data Sekarang
            </Button>
          </DashboardLink>
        </div>
      )}

      {/* Table */}
      {(loading || products.length > 0) && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama produk, ID, atau SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pendingChanges.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDrafts({})}
                  disabled={savingAll}
                >
                  Reset Perubahan
                </Button>
              )}
              <Button
                size="sm"
                className="gap-2"
                onClick={saveAllProducts}
                disabled={savingAll || pendingChanges.length === 0 || invalidChanges.length > 0}
              >
                <Save className="h-4 w-4" />
                {savingAll
                  ? 'Menyimpan...'
                  : pendingChanges.length > 0
                  ? `Simpan ${pendingChanges.length} Perubahan`
                  : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>

          <div className="border rounded-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => toggleSort('name')}
                    >
                      Produk
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-32">Sumber</TableHead>
                  <TableHead className="w-36">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => toggleSort('hpp')}
                    >
                      HPP (Rp)
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-36">Packaging (Rp)</TableHead>
                  <TableHead className="w-36">Link Inventori</TableHead>
                  <TableHead className="w-44">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  filtered.map((product) => {
                    const isSaved = !!saved[product.id]
                    const hasNoHpp = !product.hpp || product.hpp === 0
                    const productId = getDisplayProductId(product)
                    const sellerSku = getDisplaySellerSku(product)
                    const sourceTags = product.source_tags ?? []
                    const draft = drafts[product.id] ?? buildDraft(product)
                    const parsedHpp = parseDraftNumber(draft.hpp)
                    const parsedPackagingCost = parseDraftNumber(draft.packaging_cost)
                    const hppInvalid = parsedHpp === null
                    const packagingInvalid = parsedPackagingCost === null
                    const isDirty = isDraftDirty(product, drafts[product.id])
                    const rowTone = isDirty
                      ? 'bg-amber-50/60'
                      : hasNoHpp
                      ? 'bg-orange-50/50'
                      : undefined

                    return (
                      <TableRow key={product.id} className={rowTone}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm line-clamp-2">{product.product_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                              ID Produk: {productId ?? 'Belum terdeteksi'}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              SKU Seller: {sellerSku ?? 'Belum terdeteksi'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {sourceTags.length > 0 ? (
                              sourceTags.map((source) => (
                                <Badge
                                  key={source}
                                  variant={source === 'income' ? 'secondary' : 'outline'}
                                  className="text-xs"
                                >
                                  {SOURCE_LABELS[source]}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">Belum terlacak</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            className={`h-8 w-28 text-sm ${hppInvalid ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
                            value={draft.hpp}
                            onChange={(e) => updateDraft(product, { hpp: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveAllProducts()}
                            disabled={savingAll}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            className={`h-8 w-28 text-sm ${packagingInvalid ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
                            value={draft.packaging_cost}
                            onChange={(e) => updateDraft(product, { packaging_cost: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveAllProducts()}
                            disabled={savingAll}
                          />
                        </TableCell>
                        <TableCell>
                          <ItemLinkPicker
                            productId={product.id}
                            linkedItemId={linkedOverrides[product.id]?.id ?? product.linked_item_id}
                            linkedItemName={linkedOverrides[product.id]?.name ?? product.linked_item_name}
                            onLinked={(itemId, itemName) => handleLinked(product.id, itemId, itemName)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {isSaved ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Tersimpan
                              </span>
                            ) : savingAll && isDirty ? (
                              <span className="text-xs text-muted-foreground">Menyimpan...</span>
                            ) : hppInvalid || packagingInvalid ? (
                              <span className="text-xs text-red-600">Cek angka</span>
                            ) : isDirty ? (
                              <span className="text-xs text-amber-700">Belum disimpan</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {hasNoHpp ? 'Siap diisi' : 'Siap'}
                              </span>
                            )}

                            {isDirty && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => resetDraft(product.id)}
                                disabled={savingAll}
                              >
                                Reset
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteProduct(product.id)}
                              disabled={deleting[product.id] || savingAll}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deleting[product.id] ? 'Hapus...' : 'Hapus'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && filtered.length === 0 && search && (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Tidak ada produk yang cocok dengan &ldquo;{search}&rdquo;
            </p>
          )}
        </>
      )}
    </div>
  )
}
