'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Cell,
} from 'recharts'
import { TrendingUp, Target, Flame, AlertCircle, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calculateAdsOverview,
  buildTrafficLightRows,
  buildFunnelData,
  buildQuadrantData,
  buildRoasChartData,
} from '@/lib/calculations/ads-analysis'
import {
  buildHppMap,
  calculateProductProfit,
} from '@/lib/calculations/profit'
import { ROAS_THRESHOLDS } from '@/lib/constants/marketplace-fees'
import type { DbAdsRow, DbOrder, DbOrderProduct, MasterProduct, TrafficLightRow } from '@/types'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRp(n: number) {
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
    .format(n)
    .replace('IDR', 'Rp')
    .replace('\u00a0', ' ')
}

function formatRpFull(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
    .format(n)
    .replace('IDR', 'Rp')
    .replace('\u00a0', ' ')
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Signal badge
// ---------------------------------------------------------------------------

const SIGNAL_CONFIG = {
  scale: { label: '🟢 SCALE', color: 'bg-green-100 text-green-800 border-green-300' },
  optimize: { label: '🟡 OPTIMIZE', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  kill: { label: '🔴 KILL', color: 'bg-red-100 text-red-800 border-red-300' },
} as const

function SignalBadge({ signal }: { signal: keyof typeof SIGNAL_CONFIG }) {
  const { label, color } = SIGNAL_CONFIG[signal]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl sm:text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Traffic Light Table (campaign-level, with inline per-product drill-down)
// ---------------------------------------------------------------------------

type SortCol = 'name' | 'roas' | 'trueRoas' | 'conversions' | 'adSpend' | 'gmv' | 'cpa'

/** Normalize ad_name for matching against parent_iklan.
 *  Strips trailing ★ / * / whitespace so "Shop GMV Max ★" matches "Shop GMV Max". */
function normalizeAdName(name: string | null): string {
  if (!name) return ''
  return name.replace(/[★\*]+/g, '').trim()
}

function TrafficLightTable({
  rows,
  hasHppData,
  adsProductData,
}: {
  rows: TrafficLightRow[]
  hasHppData: boolean
  adsProductData: DbAdsRow[]
}) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('roas')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  /** Returns Format 2 per-product rows that belong to this campaign.
   *  Join logic (in priority order):
   *  1. If Format 2 row has parent_iklan set → match by name (normalized)
   *  2. If Format 2 row has parent_iklan = null → associate with the aggregate
   *     campaign (product_code='-'), since Format 2 is always Shop GMV Max data */
  function getBreakdownProducts(adName: string | null, productCode: string): DbAdsRow[] {
    const base = normalizeAdName(adName)
    return adsProductData.filter((r) => {
      if (r.product_code === '-') return false   // exclude aggregate row itself
      if (r.parent_iklan) {
        // Explicit parent_iklan set — match by name
        if (!base) return false
        const pi = r.parent_iklan.trim().toLowerCase()
        const bn = base.toLowerCase()
        return pi === bn || pi.includes(bn) || bn.includes(pi)
      }
      // parent_iklan is null (extraction from CSV failed) — associate all
      // Format 2 rows with the Shop GMV Max aggregate campaign
      return productCode === '-'
    })
  }

  const sorted = [...rows]
    .filter((r) => r.productName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') cmp = a.productName.localeCompare(b.productName)
      else if (sortCol === 'roas') cmp = a.roas - b.roas
      else if (sortCol === 'trueRoas') cmp = (a.trueRoas ?? -999) - (b.trueRoas ?? -999)
      else if (sortCol === 'conversions') cmp = a.conversions - b.conversions
      else if (sortCol === 'adSpend') cmp = a.adSpend - b.adSpend
      else if (sortCol === 'gmv') cmp = a.gmv - b.gmv
      else if (sortCol === 'cpa') cmp = a.cpa - b.cpa
      return sortDir === 'asc' ? cmp : -cmp
    })

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-3 opacity-40" />
        <p className="font-medium text-sm">Belum ada data iklan di periode ini</p>
        <p className="text-xs mt-1 max-w-sm">
          Upload file CSV &ldquo;Summary per Iklan&rdquo; dari Shopee Ads untuk melihat daftar kampanye.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Cari iklan..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" /> {/* expand chevron column */}
              <TableHead className="min-w-[160px]">
                <button className="flex items-center gap-1" onClick={() => toggleSort('name')}>
                  Nama Iklan <SortIcon col="name" />
                </button>
              </TableHead>
              <TableHead>Sinyal</TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('roas')}>
                  ROAS <SortIcon col="roas" />
                </button>
              </TableHead>
              {hasHppData && (
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort('trueRoas')}>
                    True ROAS <SortIcon col="trueRoas" />
                  </button>
                </TableHead>
              )}
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('conversions')}>
                  Konversi <SortIcon col="conversions" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('adSpend')}>
                  Ad Spend <SortIcon col="adSpend" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('gmv')}>
                  GMV <SortIcon col="gmv" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('cpa')}>
                  CPA <SortIcon col="cpa" />
                </button>
              </TableHead>
              <TableHead>CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.flatMap((row) => {
              const rowKey = `${row.adName ?? row.productCode}-${row.reportPeriodStart ?? 'all'}`
              const isExpanded = expandedKey === rowKey
              const breakdownProducts = getBreakdownProducts(row.adName, row.productCode)
              const hasBreakdown = breakdownProducts.length > 0

              const mainRow = (
                <TableRow
                  key={rowKey}
                  className={
                    row.signal === 'kill' ? 'bg-red-50/40' :
                    row.signal === 'scale' ? 'bg-green-50/40' : undefined
                  }
                >
                  {/* Expand chevron */}
                  <TableCell className="p-0 w-8 text-center">
                    {hasBreakdown ? (
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        className="p-2 hover:bg-muted rounded transition-colors"
                        title="Lihat detail per produk"
                        aria-expanded={isExpanded}
                      >
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </button>
                    ) : (
                      <span className="w-8 block" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium line-clamp-2">{row.productName}</p>
                      {row.productCode !== '-' && (
                        <p className="text-xs text-muted-foreground font-mono">{row.productCode}</p>
                      )}
                      {hasBreakdown && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5 mt-0.5 inline-block">
                          {breakdownProducts.length} produk
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><SignalBadge signal={row.signal} /></TableCell>
                  <TableCell>
                    <span className={`text-sm font-semibold ${row.roas >= ROAS_THRESHOLDS.scale ? 'text-green-700' : row.roas < ROAS_THRESHOLDS.kill ? 'text-red-600' : 'text-yellow-700'}`}>
                      {row.roas.toFixed(2)}x
                    </span>
                  </TableCell>
                  {hasHppData && (
                    <TableCell>
                      {row.trueRoas !== null ? (
                        <span className={`text-sm font-semibold ${row.trueRoas >= ROAS_THRESHOLDS.scale ? 'text-green-700' : row.trueRoas < ROAS_THRESHOLDS.kill ? 'text-red-600' : 'text-yellow-700'}`}>
                          {row.trueRoas.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-sm">{row.conversions.toLocaleString('id-ID')}</TableCell>
                  <TableCell className="text-sm">{formatRp(row.adSpend)}</TableCell>
                  <TableCell className="text-sm">{formatRp(row.gmv)}</TableCell>
                  <TableCell className="text-sm">{formatRp(row.cpa)}</TableCell>
                  <TableCell className="text-sm">{formatPct(row.ctr)}</TableCell>
                </TableRow>
              )

              if (!isExpanded || !hasBreakdown) return [mainRow]

              // Expanded: show per-product breakdown rows inline
              const detailRows = breakdownProducts
                .sort((a, b) => b.ad_spend - a.ad_spend)
                .map((p) => {
                  const pRoas = p.roas
                  const pSignal: keyof typeof SIGNAL_CONFIG =
                    pRoas >= ROAS_THRESHOLDS.scale ? 'scale' :
                    pRoas < ROAS_THRESHOLDS.kill ? 'kill' : 'optimize'
                  return (
                    <TableRow key={p.id} className="bg-purple-50/50">
                      <TableCell />
                      <TableCell>
                        <div className="pl-4 border-l-2 border-purple-300">
                          <p className="text-xs font-medium line-clamp-2">{p.product_name ?? '-'}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.product_code}</p>
                        </div>
                      </TableCell>
                      <TableCell><SignalBadge signal={pSignal} /></TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold ${pRoas >= ROAS_THRESHOLDS.scale ? 'text-green-700' : pRoas < ROAS_THRESHOLDS.kill ? 'text-red-600' : 'text-yellow-700'}`}>
                          {pRoas.toFixed(2)}x
                        </span>
                      </TableCell>
                      {hasHppData && <TableCell><span className="text-xs text-muted-foreground">-</span></TableCell>}
                      <TableCell className="text-xs">{p.conversions.toLocaleString('id-ID')}</TableCell>
                      <TableCell className="text-xs">{formatRp(p.ad_spend)}</TableCell>
                      <TableCell className="text-xs">{formatRp(p.gmv)}</TableCell>
                      <TableCell className="text-xs">{formatRp(p.cost_per_conversion)}</TableCell>
                      <TableCell className="text-xs">{formatPct(p.ctr)}</TableCell>
                    </TableRow>
                  )
                })

              return [mainRow, ...detailRows]
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ROAS Bar Chart
// ---------------------------------------------------------------------------

const ROAS_COLORS: Record<string, string> = {
  scale: '#16a34a',
  optimize: '#d97706',
  kill: '#dc2626',
}

function RoasBarChart({ data }: { data: ReturnType<typeof buildRoasChartData> }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(300, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
        <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v) => `${Number(v).toFixed(2)}x`}
          labelFormatter={(l) => `${l}`}
        />
        <Bar dataKey="roas" name="ROAS" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={ROAS_COLORS[entry.signal]} />
          ))}
        </Bar>
        <ReferenceLine x={ROAS_THRESHOLDS.scale} stroke="#16a34a" strokeDasharray="4 2" label={{ value: 'SCALE', position: 'top', fontSize: 10 }} />
        <ReferenceLine x={ROAS_THRESHOLDS.kill} stroke="#dc2626" strokeDasharray="4 2" label={{ value: 'KILL', position: 'top', fontSize: 10 }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Funnel Visualization
// ---------------------------------------------------------------------------

function FunnelChart({ data }: { data: ReturnType<typeof buildFunnelData> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">Produk</TableHead>
            <TableHead>Tayangan</TableHead>
            <TableHead>Klik</TableHead>
            <TableHead>CTR</TableHead>
            <TableHead>Konversi</TableHead>
            <TableHead>Conv Rate</TableHead>
            <TableHead className="min-w-[180px]">Funnel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const maxVal = row.impressions || 1
            const clickPct = (row.clicks / maxVal) * 100
            const convPct = (row.conversions / maxVal) * 100
            return (
              <TableRow key={row.productCode}>
                <TableCell>
                  <p className="text-sm font-medium line-clamp-2">{row.productName}</p>
                </TableCell>
                <TableCell className="text-sm">{row.impressions.toLocaleString('id-ID')}</TableCell>
                <TableCell className="text-sm">{row.clicks.toLocaleString('id-ID')}</TableCell>
                <TableCell className="text-sm">{formatPct(row.ctr)}</TableCell>
                <TableCell className="text-sm">{row.conversions.toLocaleString('id-ID')}</TableCell>
                <TableCell className="text-sm">{formatPct(row.conversionRate)}</TableCell>
                <TableCell>
                  <div className="space-y-1 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-blue-400 rounded-full" style={{ width: '100%' }} />
                      <span className="text-xs w-8 text-right">100%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-purple-400 rounded-full" style={{ width: `${Math.max(clickPct, 1)}%` }} />
                      <span className="text-xs w-8 text-right">{clickPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-green-400 rounded-full" style={{ width: `${Math.max(convPct, 0.5)}%` }} />
                      <span className="text-xs w-8 text-right">{convPct.toFixed(2)}%</span>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex items-center gap-4 mt-3 px-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded-full inline-block" /> Tayangan</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-purple-400 rounded-full inline-block" /> Klik</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-400 rounded-full inline-block" /> Konversi</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quadrant Matrix
// ---------------------------------------------------------------------------

function QuadrantMatrix({ data }: { data: ReturnType<typeof buildQuadrantData> }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Isi HPP produk terlebih dahulu untuk melihat quadrant matrix</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs text-center">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-2">
          <p className="font-semibold text-blue-800">⭐ Stars</p>
          <p className="text-blue-600">ROAS tinggi + profit tinggi</p>
        </div>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-2">
          <p className="font-semibold text-yellow-800">🔍 Check HPP</p>
          <p className="text-yellow-600">ROAS tinggi + profit rendah</p>
        </div>
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-2">
          <p className="font-semibold text-purple-800">📈 Optimize Ads</p>
          <p className="text-purple-600">ROAS rendah + profit tinggi</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-2">
          <p className="font-semibold text-red-800">❌ Kill</p>
          <p className="text-red-600">ROAS rendah + profit rendah</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="roas"
            name="ROAS"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: 'ROAS', position: 'insideBottom', offset: -5, fontSize: 12 }}
            tickFormatter={(v) => `${v}x`}
          />
          <YAxis
            dataKey="profitPerUnit"
            name="Profit/Unit"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: 'Profit/Unit', angle: -90, position: 'insideLeft', fontSize: 12 }}
            tickFormatter={(v) => formatRp(v)}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ReturnType<typeof buildQuadrantData>[0]
              return (
                <div className="bg-background border rounded-lg p-3 shadow-lg text-sm max-w-[200px]">
                  <p className="font-medium mb-1 line-clamp-2">{d.productName}</p>
                  <p>ROAS: {d.roas.toFixed(2)}x</p>
                  <p>Profit/unit: {formatRpFull(d.profitPerUnit)}</p>
                  <p>Ad Spend: {formatRpFull(d.adSpend)}</p>
                  <SignalBadge signal={d.signal} />
                </div>
              )
            }}
          />
          <ReferenceLine x={ROAS_THRESHOLDS.scale} stroke="#16a34a" strokeDasharray="5 3" />
          <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="5 3" />
          <Scatter
            data={data}
            fill="#3b82f6"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={ROAS_COLORS[entry.signal]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

interface Props {
  adsData: DbAdsRow[]
  adsProductData: DbAdsRow[]
  masterProducts: MasterProduct[]
  orders: DbOrder[]
  orderProducts: DbOrderProduct[]
  hasIncomeData: boolean
}

export default function AdsDashboard({ adsData, adsProductData, masterProducts, orders, orderProducts, hasIncomeData }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  // Derive available months from ALL data (including aggregate-only months like April
  // where only Shop GMV Max ran — still a valid period worth selecting)
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>()
    for (const ad of adsData) {
      const date = ad.report_period_start ?? ad.report_period_end
      if (date) monthSet.add(date.slice(0, 7))
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a)) // newest first
  }, [adsData])

  // Filter ads by selected month (based on report_period)
  const filteredAds = useMemo(() => {
    if (selectedMonth === 'all') return adsData
    const monthStart = `${selectedMonth}-01`
    const [y, m] = selectedMonth.split('-').map(Number)
    const nextMonth = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
    return adsData.filter((ad) => {
      const end = ad.report_period_end ?? ad.report_period_start
      const start = ad.report_period_start ?? ad.report_period_end
      if (!end || !start) return true
      return end >= monthStart && start < nextMonth
    })
  }, [adsData, selectedMonth])

  // Period label — derive from all filtered ads (including aggregate rows)
  const periodLabel = useMemo(() => {
    const starts = filteredAds.map((a) => a.report_period_start).filter(Boolean) as string[]
    const ends = filteredAds.map((a) => a.report_period_end).filter(Boolean) as string[]
    if (!starts.length) return null
    const minStart = [...starts].sort()[0]
    const maxEnd = [...ends].sort().reverse()[0]
    const fmt = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    return maxEnd ? `${fmt(minStart)} – ${fmt(maxEnd)}` : fmt(minStart)
  }, [filteredAds])

  // Whether the selected period has any per-product campaigns with actual spend
  const hasPerProductCampaigns = useMemo(
    () => filteredAds.some((a) => a.product_code !== '-' && a.ad_spend > 0),
    [filteredAds]
  )

  const kpis = useMemo(() => calculateAdsOverview(filteredAds), [filteredAds])

  const trafficLightRows = useMemo(
    () => buildTrafficLightRows(filteredAds, masterProducts),
    [filteredAds, masterProducts]
  )

  const funnelData = useMemo(() => buildFunnelData(filteredAds), [filteredAds])

  const roasChartData = useMemo(() => buildRoasChartData(filteredAds), [filteredAds])

  // For quadrant + True ROAS, we need profit data from income
  const hppMap = useMemo(() => buildHppMap(masterProducts), [masterProducts])
  const profitRows = useMemo(
    () => hasIncomeData ? calculateProductProfit(orders, orderProducts, hppMap, filteredAds) : [],
    [orders, orderProducts, hppMap, filteredAds, hasIncomeData]
  )

  const quadrantData = useMemo(
    () => buildQuadrantData(filteredAds, profitRows),
    [filteredAds, profitRows]
  )

  const hasHppData = masterProducts.some((p) => p.hpp > 0)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analisis Iklan</h1>
          <p className="text-muted-foreground mt-0.5">
            {hasPerProductCampaigns
              ? `${kpis.productCount} produk diiklankan`
              : 'Hanya kampanye toko (Shop GMV Max)'}
            {periodLabel && <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{periodLabel}</span>}
          </p>
        </div>
        {/* Month slicer */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedMonth} onValueChange={(v) => v && setSelectedMonth(v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Pilih periode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Periode</SelectItem>
              {availableMonths.map((month) => (
                <SelectItem key={month} value={month}>
                  {new Date(`${month}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Ad Spend"
          value={formatRp(kpis.totalAdSpend)}
          icon={Flame}
          color="bg-red-100 text-red-600"
        />
        <KpiCard
          label="Total GMV Iklan"
          value={formatRp(kpis.totalGmv)}
          icon={TrendingUp}
          color="bg-green-100 text-green-600"
        />
        <KpiCard
          label="Overall ROAS"
          value={`${kpis.overallRoas.toFixed(2)}x`}
          sub={kpis.overallRoas >= ROAS_THRESHOLDS.scale ? '✅ Bagus' : kpis.overallRoas < ROAS_THRESHOLDS.kill ? '⚠️ Kurang' : '🔶 Cukup'}
          icon={Target}
          color="bg-blue-100 text-blue-600"
        />
        <KpiCard
          label="Total Konversi"
          value={kpis.totalConversions.toLocaleString('id-ID')}
          icon={TrendingUp}
          color="bg-purple-100 text-purple-600"
        />
        <KpiCard
          label="Avg CPA"
          value={formatRp(kpis.avgCpa)}
          sub="Biaya per konversi"
          icon={Target}
          color="bg-orange-100 text-orange-600"
        />
      </div>

      {/* Banner: aggregate-only period notice */}
      {!hasPerProductCampaigns && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
          <div>
            <p className="font-medium">Periode ini hanya memiliki kampanye Shop GMV Max (tingkat toko)</p>
            <p className="text-xs mt-0.5 text-blue-600">
              Tidak ada kampanye per-produk aktif. KPI di atas berasal dari kampanye toko.
              Analisis ROAS per-produk tidak tersedia untuk periode ini.
            </p>
          </div>
        </div>
      )}

      {/* Traffic Light Summary */}
      {hasPerProductCampaigns && (
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <span className="text-xl">🟢</span>
          <div>
            <p className="text-xs text-muted-foreground">SCALE</p>
            <p className="text-lg font-bold text-green-700">{kpis.scaleCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          <span className="text-xl">🟡</span>
          <div>
            <p className="text-xs text-muted-foreground">OPTIMIZE</p>
            <p className="text-lg font-bold text-yellow-700">{kpis.optimizeCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-xl">🔴</span>
          <div>
            <p className="text-xs text-muted-foreground">KILL</p>
            <p className="text-lg font-bold text-red-700">{kpis.killCount}</p>
          </div>
        </div>
      </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="traffic" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="traffic">Traffic Light</TabsTrigger>
          <TabsTrigger value="roas">ROAS Chart</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          {hasIncomeData && (
            <TabsTrigger value="quadrant">
              Quadrant Matrix
              {!hasHppData && (
                <Badge variant="secondary" className="ml-1 text-xs">Perlu HPP</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Traffic Light Table */}
        <TabsContent value="traffic">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Rekomendasi per Iklan</CardTitle>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>🟢 SCALE: ROAS ≥ {ROAS_THRESHOLDS.scale}x AND konversi ≥ {ROAS_THRESHOLDS.minConversions}</p>
                  <p>🔴 KILL: ROAS &lt; {ROAS_THRESHOLDS.kill}x</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TrafficLightTable
                rows={trafficLightRows}
                hasHppData={hasHppData}
                adsProductData={adsProductData}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ROAS Bar Chart */}
        <TabsContent value="roas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ROAS per Produk (Top 20)</CardTitle>
            </CardHeader>
            <CardContent>
              <RoasBarChart data={roasChartData} />
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ background: ROAS_COLORS.scale }} /> SCALE</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ background: ROAS_COLORS.optimize }} /> OPTIMIZE</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ background: ROAS_COLORS.kill }} /> KILL</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funnel */}
        <TabsContent value="funnel">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Funnel Iklan (Top 10 by Ad Spend)</CardTitle>
            </CardHeader>
            <CardContent>
              <FunnelChart data={funnelData} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quadrant Matrix */}
        {hasIncomeData && (
          <TabsContent value="quadrant">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">ROAS vs Profit Quadrant</CardTitle>
                  {!hasHppData && (
                    <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Isi HPP di Master Produk untuk melihat quadrant
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <QuadrantMatrix data={quadrantData} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Direct vs Indirect */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Direct vs Indirect Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Produk</TableHead>
                  <TableHead>GMV Total</TableHead>
                  <TableHead>GMV Langsung</TableHead>
                  <TableHead>% Langsung</TableHead>
                  <TableHead>Konversi</TableHead>
                  <TableHead>Konversi Langsung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                    // Dedupe by product_code (keep highest gmv row per product when all periods shown)
                    const seen = new Set<string>()
                    return filteredAds
                      .filter((r) => r.product_code !== '-' && r.gmv > 0 && r.ad_spend > 0)
                      .sort((a, b) => b.gmv - a.gmv)
                      .filter((r) => { if (seen.has(r.product_code)) return false; seen.add(r.product_code); return true })
                      .slice(0, 15)
                  })()
                  .map((r) => {
                    const directPct = r.gmv > 0 ? (r.direct_gmv / r.gmv) * 100 : 0
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="text-sm font-medium line-clamp-2">{r.product_name ?? r.product_code}</p>
                        </TableCell>
                        <TableCell className="text-sm">{formatRp(r.gmv)}</TableCell>
                        <TableCell className="text-sm">{formatRp(r.direct_gmv)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[60px]">
                              <div
                                className="bg-primary h-1.5 rounded-full"
                                style={{ width: `${Math.min(directPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs w-10">{directPct.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{r.conversions}</TableCell>
                        <TableCell className="text-sm">{r.direct_conversions}</TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
