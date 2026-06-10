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
  AlertCircle,
  ArrowUpDown,
  Upload,
  Trash2,
  Link2,
  X,
} from 'lucide-react'
import { DashboardLink } from '@/components/layout/dashboard-link'
import type { MasterProduct, MasterProductSourceTag, Item } from '@/types'

// Inline item link picker per row
function ItemLinkPicker({
  productId,
  linkedItemId,
  linkedItemName,
  onLinked,
  onError,
}: {
  productId: string
  linkedItemId?: string | null
  linkedItemName?: string | null
  onLinked: (itemId: string | null, itemName: string | null, hpp: number | null, packagingCost: number | null) => void
  onError: (message: string) => void
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
      const res = await fetch(`/api/master-products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_item_id: itemId }),
      })
      const json = await res.json().catch(() => null) as { hpp?: number | null; packaging_cost?: number | null; error?: string } | null
      if (!res.ok) {
        onError(json?.error ?? 'Gagal menghubungkan item. Coba lagi.')
        return
      }
      onLinked(itemId, itemName, json?.hpp ?? null, json?.packaging_cost ?? null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menghubungkan item. Coba lagi.')
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

function formatRupiah(value: number) {
  return 'Rp ' + value.toLocaleString('id-ID')
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
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  // linked_item overrides per product (keyed by product.id)
  const [linkedOverrides, setLinkedOverrides] = useState<Record<string, { id: string | null; name: string | null }>>({})

  function handleLinked(productId: string, itemId: string | null, itemName: string | null, hpp: number | null, packagingCost: number | null) {
    setLinkedOverrides((prev) => ({ ...prev, [productId]: { id: itemId, name: itemName } }))
    setError(null)
    // Linking pulls the item's HPP & packaging into the product server-side;
    // unlinking clears them back to 0. Reflect whatever the server returns locally.
    if (hpp != null || packagingCost != null) {
      setProducts((prev) => prev.map((p) => (p.id === productId
        ? { ...p, ...(hpp != null ? { hpp } : {}), ...(packagingCost != null ? { packaging_cost: packagingCost } : {}) }
        : p)))
    }
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
        setError(json?.error ?? 'Gagal mengambil data produk')
        return
      }

      setProducts(json?.products ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setProducts([])
      setError(`Gagal mengambil data produk: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [scopeParams])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

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
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(`Gagal menghapus produk: ${message}`)
      setDeleting((prev) => ({ ...prev, [productId]: false }))
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
          <h1 className="text-2xl font-bold">Mapping Produk</h1>
          <p className="text-muted-foreground mt-1">
            {products.length} produk terdaftar
            {noHppCount > 0 && (
              <span className="text-orange-600 ml-1">· {noHppCount} belum ada HPP</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Info: HPP & Packaging dikelola di Master Item */}
      {!loading && products.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            HPP &amp; Packaging kini diatur di <strong>Master Item</strong> (Inventori &amp; Produksi).
            Di halaman ini nilainya hanya ditampilkan sebagai informasi. Hubungkan produk ke item lewat kolom <strong>Link Inventori</strong> agar HPP terisi otomatis.
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
                    const hasNoHpp = !product.hpp || product.hpp === 0
                    const productId = getDisplayProductId(product)
                    const sellerSku = getDisplaySellerSku(product)
                    const sourceTags = product.source_tags ?? []
                    const hasPackaging = !!product.packaging_cost && product.packaging_cost > 0
                    const rowTone = hasNoHpp ? 'bg-orange-50/50' : undefined

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
                          {hasNoHpp ? (
                            <span className="text-xs text-muted-foreground">Belum diisi</span>
                          ) : (
                            <span className="text-sm font-medium tabular-nums">{formatRupiah(product.hpp)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasPackaging ? (
                            <span className="text-sm tabular-nums">{formatRupiah(product.packaging_cost)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ItemLinkPicker
                            productId={product.id}
                            linkedItemId={linkedOverrides[product.id]?.id ?? product.linked_item_id}
                            linkedItemName={linkedOverrides[product.id]?.name ?? product.linked_item_name}
                            onLinked={(itemId, itemName, hpp, packagingCost) => handleLinked(product.id, itemId, itemName, hpp, packagingCost)}
                            onError={(message) => setError(message)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteProduct(product.id)}
                              disabled={deleting[product.id]}
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
