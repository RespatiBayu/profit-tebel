'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
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
} from 'lucide-react'
import Link from 'next/link'
import type { MasterProduct } from '@/types'

function formatRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(n)
    .replace('IDR', 'Rp')
    .replace(/\u00a0/, ' ')
}

interface EditingProduct {
  hpp: string
  packaging_cost: string
}

export default function ProductsPage() {
  const [products, setProducts] = useState<MasterProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'hpp'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<Record<string, EditingProduct>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('master_products')
      .select('*')
      .order('product_name', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      // Join with order_products and ads_data to detect sources
      const productIds = (data ?? []).map((p) => p.marketplace_product_id)

      const [{ data: incomeIds }, { data: adsIds }] = await Promise.all([
        supabase
          .from('order_products')
          .select('marketplace_product_id')
          .in('marketplace_product_id', productIds),
        supabase
          .from('ads_data')
          .select('product_code')
          .in('product_code', productIds),
      ])

      const incomeSet = new Set((incomeIds ?? []).map((r) => r.marketplace_product_id))
      const adsSet = new Set((adsIds ?? []).map((r) => r.product_code))

      setProducts(
        (data ?? []).map((p) => ({
          ...p,
          has_income_data: incomeSet.has(p.marketplace_product_id),
          has_ads_data: adsSet.has(p.marketplace_product_id),
        }))
      )
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  function startEdit(id: string, product: MasterProduct) {
    setEditing((prev) => ({
      ...prev,
      [id]: { hpp: String(product.hpp || ''), packaging_cost: String(product.packaging_cost || '') },
    }))
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function saveProduct(product: MasterProduct) {
    const edit = editing[product.id]
    if (!edit) return

    const hpp = parseFloat(edit.hpp.replace(',', '.')) || 0
    const packaging_cost = parseFloat(edit.packaging_cost.replace(',', '.')) || 0

    setSaving((prev) => ({ ...prev, [product.id]: true }))

    const { error } = await supabase
      .from('master_products')
      .update({ hpp, packaging_cost })
      .eq('id', product.id)

    setSaving((prev) => ({ ...prev, [product.id]: false }))

    if (error) {
      setError(`Gagal menyimpan: ${error.message}`)
    } else {
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, hpp, packaging_cost } : p)
      )
      cancelEdit(product.id)
      setSaved((prev) => ({ ...prev, [product.id]: true }))
      setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[product.id]; return n }), 2000)
    }
  }

  // Filter + sort
  const filtered = products
    .filter((p) => {
      const q = search.toLowerCase()
      return (
        p.product_name.toLowerCase().includes(q) ||
        p.marketplace_product_id.toLowerCase().includes(q)
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
        <Link href="/dashboard/upload">
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Data
          </Button>
        </Link>
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
          <Link href="/dashboard/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data Sekarang
            </Button>
          </Link>
        </div>
      )}

      {/* Table */}
      {(loading || products.length > 0) && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nama produk atau ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                  <TableHead className="w-32">Aksi</TableHead>
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
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  filtered.map((product) => {
                    const isEditing = !!editing[product.id]
                    const isSaving = !!saving[product.id]
                    const isSaved = !!saved[product.id]
                    const hasNoHpp = !product.hpp || product.hpp === 0

                    return (
                      <TableRow key={product.id} className={hasNoHpp && !isEditing ? 'bg-orange-50/50' : undefined}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm line-clamp-2">{product.product_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                              {product.marketplace_product_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {product.has_income_data && (
                              <Badge variant="secondary" className="text-xs">Income</Badge>
                            )}
                            {product.has_ads_data && (
                              <Badge variant="outline" className="text-xs">Iklan</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-28 text-sm"
                              value={editing[product.id].hpp}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [product.id]: { ...prev[product.id], hpp: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => e.key === 'Enter' && saveProduct(product)}
                            />
                          ) : (
                            <span
                              className={`text-sm cursor-pointer hover:underline ${hasNoHpp ? 'text-orange-600 font-medium' : ''}`}
                              onClick={() => startEdit(product.id, product)}
                            >
                              {hasNoHpp ? 'Belum diisi' : formatRp(product.hpp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-28 text-sm"
                              value={editing[product.id].packaging_cost}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [product.id]: { ...prev[product.id], packaging_cost: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => e.key === 'Enter' && saveProduct(product)}
                            />
                          ) : (
                            <span
                              className="text-sm cursor-pointer hover:underline"
                              onClick={() => startEdit(product.id, product)}
                            >
                              {formatRp(product.packaging_cost ?? 0)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isSaved ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Tersimpan
                            </span>
                          ) : isEditing ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => saveProduct(product)}
                                disabled={isSaving}
                              >
                                <Save className="h-3 w-3" />
                                {isSaving ? '...' : 'Simpan'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => cancelEdit(product.id)}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => startEdit(product.id, product)}
                            >
                              Edit
                            </Button>
                          )}
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
