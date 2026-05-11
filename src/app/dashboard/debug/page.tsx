'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Upload } from 'lucide-react'

type MatchedBy = 'name' | 'sku' | 'numeric' | null

interface TraceItem {
  sku: string | null
  name: string | null
  qty: number
  matched: boolean
  matchedBy: MatchedBy
  masterId: string | null
  masterSku: string | null
  masterHpp: number
  masterPackaging: number
}

interface Trace {
  order_number: string
  order_date: string | null
  storedHpp: number
  computedHpp: number
  items: TraceItem[]
}

interface MasterSample {
  id: string
  marketplace_product_id: string
  numeric_id: string | null
  product_name: string | null
  hpp: number
  packaging_cost: number
  isNumericKeyed: boolean
}

interface DebugResult {
  storeFilter: string | null
  masterStats: {
    total: number
    withHpp: number
    skuKeyed: number
    numericKeyed: number
    duplicateNames: number
  }
  masterSample: MasterSample[]
  ordersAll: {
    total: number
    storedHppGt0: number
    computedHppGt0: number
    itemsTotal: number
    itemsMatched: number
    itemsMatchedPct: number
    sampleTraces: Trace[]
  }
  orders: {
    total: number
    storedHppGt0: number
    computedHppGt0: number
    withNoOrderProducts: number
    itemsTotal: number
    itemsMatched: number
    itemsMatchedPct: number
    sampleTraces: Trace[]
  }
  unmatchedSamples: Array<{
    source: string
    order_number: string
    sku: string | null
    name: string | null
  }>
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

interface OpfTrace {
  sheet_names: string[]
  opfSheetName: string | null
  opfSheetRawRowCount: number
  colB_marker_distribution: Record<string, number>
  allRowTypesLowercase: string[]
  orderMarkerRows: number
  skuMarkerRows: number
  skuRowsWithoutCurrentOrder: number
  skuRowsWithoutProductId: number
  parsedOpfRows: number
  distinctOrderNumbersInOpf: number
  sample_parsed: Array<{ order_number: string; marketplace_product_id: string; product_name: string | null }>
  dbOrdersCount: number
  inOpfButNotInDb_count: number
  inOpfButNotInDb_sample: string[]
  inDbButNotInOpf_count: number
  inDbButNotInOpf_sample: Array<{ order_number: string; order_date: string | null }>
  masterMatching: {
    matched: number
    unmatched: number
    total: number
    unmatchedSamples: Array<{ order_number: string; marketplace_product_id: string; product_name: string | null }>
  }
}

export default function DebugPage() {
  const searchParams = useSearchParams()
  const storeId = searchParams.get('store') ?? ''
  const [data, setData] = useState<DebugResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllItems, setShowAllItems] = useState(false)

  // OPF trace state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [opfData, setOpfData] = useState<OpfTrace | null>(null)
  const [opfLoading, setOpfLoading] = useState(false)
  const [opfError, setOpfError] = useState<string | null>(null)

  async function handleOpfTrace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    setOpfLoading(true)
    setOpfError(null)
    setOpfData(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (storeId) fd.append('storeId', storeId)
      const res = await fetch('/api/debug/opf-trace', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) setOpfError(json.error ?? `HTTP ${res.status}`)
      else setOpfData(json as OpfTrace)
    } catch (err) {
      setOpfError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpfLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = storeId
        ? `/api/debug/hpp-match?store=${encodeURIComponent(storeId)}`
        : '/api/debug/hpp-match'
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
      } else {
        setData(json as DebugResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Debug: HPP Matching</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Trace setiap order → cek apakah master ditemukan, kenapa tidak match.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm font-mono">{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Memuat data...</p>
      )}

      {data && (
        <>
          {/* ============== MASTER STATS ============== */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Master Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <Stat label="Total master" value={data.masterStats.total} />
                <Stat
                  label="Punya HPP terisi"
                  value={data.masterStats.withHpp}
                  highlight={data.masterStats.withHpp === 0 ? 'red' : 'green'}
                />
                <Stat label="SKU-keyed" value={data.masterStats.skuKeyed} />
                <Stat label="Numeric-keyed" value={data.masterStats.numericKeyed} />
                <Stat
                  label="Nama duplikat"
                  value={data.masterStats.duplicateNames}
                  highlight={data.masterStats.duplicateNames > 0 ? 'amber' : undefined}
                />
              </div>

              {data.masterStats.withHpp === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Tidak ada master dengan HPP &gt; 0 → mustahil HPP order bisa kehitung.
                    Isi HPP di menu Master Produk dulu.
                  </AlertDescription>
                </Alert>
              )}
              {data.masterStats.duplicateNames > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-800">
                    Ada {data.masterStats.duplicateNames} nama produk yang punya master ganda (numeric &amp; SKU). Resolver
                    sekarang prefer yang HPP &gt; 0 + SKU-keyed, tapi sebaiknya merge/hapus duplikat lewat menu Master Produk.
                  </AlertDescription>
                </Alert>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer font-medium">Sample 20 master produk</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 border">marketplace_product_id</th>
                        <th className="text-left p-2 border">numeric_id</th>
                        <th className="text-left p-2 border">product_name</th>
                        <th className="text-right p-2 border">HPP</th>
                        <th className="text-right p-2 border">Pkg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.masterSample.map((m) => (
                        <tr key={m.id} className="border-b">
                          <td className="p-2 border font-mono">
                            {m.marketplace_product_id}
                            {m.isNumericKeyed && <Badge variant="outline" className="ml-1 text-[10px]">numeric</Badge>}
                          </td>
                          <td className="p-2 border font-mono">{m.numeric_id ?? '—'}</td>
                          <td className="p-2 border">{m.product_name ?? '—'}</td>
                          <td className="p-2 border text-right">{formatRp(m.hpp)}</td>
                          <td className="p-2 border text-right">{formatRp(m.packaging_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardContent>
          </Card>

          {/* ============== ORDERS_ALL SUMMARY ============== */}
          <SourceCard
            title="2. orders_all (Order.all)"
            stats={[
              { label: 'Total order', value: data.ordersAll.total },
              {
                label: 'storedHpp > 0 (di DB)',
                value: data.ordersAll.storedHppGt0,
                highlight: data.ordersAll.storedHppGt0 === 0 ? 'red' : 'green',
              },
              {
                label: 'computed (live resolver)',
                value: data.ordersAll.computedHppGt0,
                highlight: data.ordersAll.computedHppGt0 === 0 ? 'red' : 'green',
              },
              {
                label: `Item matched ${data.ordersAll.itemsMatchedPct}%`,
                value: `${data.ordersAll.itemsMatched}/${data.ordersAll.itemsTotal}`,
              },
            ]}
            traces={data.ordersAll.sampleTraces}
            showAllItems={showAllItems}
          />

          {data.ordersAll.storedHppGt0 === 0 && data.ordersAll.computedHppGt0 > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-900">
                Resolver bisa match (computed &gt; 0), tapi DB masih kosong (stored = 0). Klik tombol{' '}
                <strong>Recalculate HPP</strong> di Upload Data untuk apply ke DB.
              </AlertDescription>
            </Alert>
          )}

          {/* ============== ORDERS (INCOME) SUMMARY ============== */}
          <SourceCard
            title="3. orders (Income)"
            stats={[
              { label: 'Total order', value: data.orders.total },
              {
                label: 'storedHpp > 0 (di DB)',
                value: data.orders.storedHppGt0,
                highlight: data.orders.storedHppGt0 === 0 ? 'red' : 'green',
              },
              {
                label: 'computed (live)',
                value: data.orders.computedHppGt0,
                highlight: data.orders.computedHppGt0 === 0 ? 'red' : 'green',
              },
              {
                label: `Item matched ${data.orders.itemsMatchedPct}%`,
                value: `${data.orders.itemsMatched}/${data.orders.itemsTotal}`,
              },
              {
                label: 'Tanpa order_products',
                value: data.orders.withNoOrderProducts,
                highlight: data.orders.withNoOrderProducts > 0 ? 'amber' : undefined,
              },
            ]}
            traces={data.orders.sampleTraces}
            showAllItems={showAllItems}
          />

          {data.orders.storedHppGt0 === 0 && data.orders.computedHppGt0 > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-900">
                Income: Resolver bisa match tapi DB belum di-update. Klik <strong>Recalculate HPP</strong>.
              </AlertDescription>
            </Alert>
          )}

          {data.orders.withNoOrderProducts > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-900">
                {data.orders.withNoOrderProducts} order income tidak punya entry di <code>order_products</code>.
                Upload Order.all untuk periode yang sama supaya mapping SKU terbentuk.
              </AlertDescription>
            </Alert>
          )}

          {/* ============== UNMATCHED SAMPLES ============== */}
          {data.unmatchedSamples.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">Sample item yang TIDAK match</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 border">Source</th>
                        <th className="text-left p-2 border">Order</th>
                        <th className="text-left p-2 border">SKU di order</th>
                        <th className="text-left p-2 border">Nama di order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.unmatchedSamples.map((s, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 border">{s.source}</td>
                          <td className="p-2 border font-mono">{s.order_number}</td>
                          <td className="p-2 border font-mono">{s.sku ?? '—'}</td>
                          <td className="p-2 border">{s.name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAllItems(!showAllItems)}>
              {showAllItems ? 'Sembunyikan' : 'Tampilkan'} detail item per order
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2))
              }}
            >
              Copy raw JSON
            </Button>
          </div>
        </>
      )}

      {/* ============== OPF TRACE (upload income XLSX → tracer) ============== */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            🔬 OPF Tracer — upload file Income XLSX (TIDAK disimpan)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Trace langsung sheet &quot;Order Processing Fee&quot; tanpa write ke DB. Liat
            berapa baris OPF yang ada, berapa yang match master, dan mana income
            order yang TIDAK punya OPF row.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleOpfTrace} className="flex items-end gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls"
              className="text-sm"
              required
            />
            <Button type="submit" disabled={opfLoading} size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              {opfLoading ? 'Memproses...' : 'Trace OPF'}
            </Button>
          </form>

          {opfError && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-mono">{opfError}</AlertDescription>
            </Alert>
          )}

          {opfData && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Sheet OPF" value={opfData.opfSheetName ?? '—'} />
                <Stat label="Total raw rows" value={opfData.opfSheetRawRowCount} />
                <Stat
                  label='Order marker (col B)'
                  value={opfData.orderMarkerRows}
                  highlight={opfData.orderMarkerRows === 0 ? 'red' : 'green'}
                />
                <Stat
                  label='Sku marker (col B)'
                  value={opfData.skuMarkerRows}
                  highlight={opfData.skuMarkerRows === 0 ? 'red' : 'green'}
                />
                <Stat label="Parsed OPF rows" value={opfData.parsedOpfRows} />
                <Stat label="Distinct order# in OPF" value={opfData.distinctOrderNumbersInOpf} />
                <Stat label="Income orders di DB" value={opfData.dbOrdersCount} />
                <Stat
                  label="Income TANPA OPF row"
                  value={opfData.inDbButNotInOpf_count}
                  highlight={opfData.inDbButNotInOpf_count > 0 ? 'red' : 'green'}
                />
                <Stat
                  label="Resolver matched"
                  value={`${opfData.masterMatching.matched}/${opfData.masterMatching.total}`}
                  highlight={
                    opfData.masterMatching.unmatched > 0
                      ? opfData.masterMatching.matched === 0
                        ? 'red'
                        : 'amber'
                      : 'green'
                  }
                />
              </div>

              {opfData.skuRowsWithoutCurrentOrder > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {opfData.skuRowsWithoutCurrentOrder} baris Sku tanpa Order parent — parser nggak bisa kaitkan ke
                    order_number. Mungkin struktur OPF berbeda dari yang diasumsikan.
                  </AlertDescription>
                </Alert>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer font-medium">Distribusi nilai column B (rowType marker)</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 border">Value</th>
                        <th className="text-right p-2 border">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(opfData.colB_marker_distribution).map(([k, v]) => (
                        <tr key={k} className="border-b">
                          <td className="p-2 border font-mono">{k}</td>
                          <td className="p-2 border text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              {opfData.inDbButNotInOpf_count > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-red-700">
                    Sample 10 income order yang TIDAK ada di OPF
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {opfData.inDbButNotInOpf_sample.map((r) => (
                      <li key={r.order_number} className="font-mono">
                        {r.order_number} <span className="text-muted-foreground">({r.order_date ?? '?'})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {opfData.masterMatching.unmatchedSamples.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-amber-700">
                    Sample OPF row yang gagal match master
                  </summary>
                  <table className="w-full text-xs border mt-2">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 border">Order#</th>
                        <th className="text-left p-2 border">Product ID</th>
                        <th className="text-left p-2 border">Product Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opfData.masterMatching.unmatchedSamples.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 border font-mono">{r.order_number}</td>
                          <td className="p-2 border font-mono">{r.marketplace_product_id}</td>
                          <td className="p-2 border">{r.product_name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(opfData, null, 2))}
              >
                Copy OPF trace JSON
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: 'green' | 'red' | 'amber'
}) {
  const cls =
    highlight === 'green'
      ? 'text-green-700'
      : highlight === 'red'
      ? 'text-red-700'
      : highlight === 'amber'
      ? 'text-amber-700'
      : ''
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
    </div>
  )
}

function SourceCard({
  title,
  stats,
  traces,
  showAllItems,
}: {
  title: string
  stats: Array<{ label: string; value: string | number; highlight?: 'green' | 'red' | 'amber' }>
  traces: Trace[]
  showAllItems: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          {stats.map((s, i) => (
            <Stat key={i} label={s.label} value={s.value} highlight={s.highlight} />
          ))}
        </div>

        {showAllItems && traces.length > 0 && (
          <details open className="text-xs">
            <summary className="cursor-pointer font-medium">Sample {traces.length} order (trace per item)</summary>
            <div className="mt-2 space-y-2 max-h-[500px] overflow-auto">
              {traces.map((t) => (
                <div key={t.order_number} className="border rounded p-2 bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs">{t.order_number}</span>
                    <span className="text-xs text-muted-foreground">
                      stored: {formatRp(t.storedHpp)} | computed: {formatRp(t.computedHpp)}
                      {t.storedHpp !== t.computedHpp && (
                        <Badge variant="outline" className="ml-1 text-[10px] border-amber-400 text-amber-700">
                          drift
                        </Badge>
                      )}
                    </span>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead className="bg-background">
                      <tr>
                        <th className="text-left p-1">Match</th>
                        <th className="text-left p-1">SKU di order</th>
                        <th className="text-left p-1">Nama</th>
                        <th className="text-right p-1">Qty</th>
                        <th className="text-left p-1">Master SKU</th>
                        <th className="text-right p-1">HPP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.items.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-1">
                            {it.matched ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <CheckCircle className="h-3 w-3" />
                                {it.matchedBy}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-700">
                                <XCircle className="h-3 w-3" />
                                miss
                              </span>
                            )}
                          </td>
                          <td className="p-1 font-mono">{it.sku ?? '—'}</td>
                          <td className="p-1">{it.name ?? '—'}</td>
                          <td className="p-1 text-right">{it.qty}</td>
                          <td className="p-1 font-mono">{it.masterSku ?? '—'}</td>
                          <td className="p-1 text-right">{formatRp(it.masterHpp + it.masterPackaging)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
