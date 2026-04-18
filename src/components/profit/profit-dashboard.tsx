'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import {
  AlertCircle,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Info,
  Wallet,
  Receipt,
  Percent,
  ShoppingBag,
  Zap,
} from 'lucide-react'
import {
  buildHppMap,
  buildOrderProductMap,
  calculateKpis,
  calculateFeeBreakdown,
  calculateTrend,
  calculateProductProfit,
  calculateCashFlowGap,
  calculatePaymentDistribution,
  calculateCourierStats,
} from '@/lib/calculations/profit'
import { buildTrafficLightRows } from '@/lib/calculations/ads-analysis'
import {
  buildScaleRecommendations,
  pickScalableCampaigns,
} from '@/lib/calculations/roas-recommendations'
import {
  calculateBusyDays,
  calculateTopProducts,
  calculateTopBuyers,
  calculateDailyDetail,
} from '@/lib/calculations/dashboard-analytics'
import {
  ScaleRecommendationsSection,
  RoasTargetsSection,
  BusyDaysSection,
  TopProductsSection,
  TopBuyersSection,
  DailyDetailSection,
} from '@/components/profit/dashboard-sections'
import type { DbOrder, DbOrderProduct, DbAdsRow, MasterProduct, ProductProfitRow } from '@/types'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRp(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// KPI Cards
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  tooltip,
  cta,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'red' | 'blue' | 'orange' | 'default' | 'muted'
  icon?: React.ComponentType<{ className?: string }>
  tooltip?: string
  cta?: { label: string; href: string }
}) {
  const colors = {
    green: 'text-green-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    orange: 'text-orange-600',
    default: 'text-foreground',
    muted: 'text-muted-foreground',
  }
  const iconBg = {
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    default: 'bg-muted text-muted-foreground',
    muted: 'bg-muted text-muted-foreground',
  }
  return (
    <Card className="relative">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {label}
            {tooltip && (
              <span title={tooltip} className="inline-flex cursor-help">
                <Info className="h-3 w-3 opacity-60" />
              </span>
            )}
          </p>
          {Icon && (
            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${iconBg[accent ?? 'default']}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <p className={`text-xl sm:text-2xl font-bold ${colors[accent ?? 'default']}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {cta && (
          <Link href={cta.href} className="mt-2 inline-block">
            <span className="text-xs text-primary hover:underline font-medium">{cta.label} →</span>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Product profit table with sort
// ---------------------------------------------------------------------------

type SortCol = 'name' | 'orders' | 'income' | 'hpp' | 'profit' | 'margin'

function ProductProfitTable({ rows }: { rows: ProductProfitRow[] }) {
  const [sortCol, setSortCol] = useState<SortCol>('profit')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const sorted = [...rows]
    .filter((r) => r.productName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') cmp = a.productName.localeCompare(b.productName)
      else if (sortCol === 'orders') cmp = a.orderCount - b.orderCount
      else if (sortCol === 'income') cmp = a.attributedIncome - b.attributedIncome
      else if (sortCol === 'hpp') cmp = a.totalHppCost - b.totalHppCost
      else if (sortCol === 'profit') cmp = a.profit - b.profit
      else if (sortCol === 'margin') cmp = (a.margin ?? -999) - (b.margin ?? -999)
      return sortDir === 'asc' ? cmp : -cmp
    })

  return (
    <div className="space-y-3">
      <Input
        placeholder="Cari produk..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">
                <button className="flex items-center gap-1" onClick={() => toggleSort('name')}>
                  Produk <SortIcon col="name" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('orders')}>
                  Orders <SortIcon col="orders" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('income')}>
                  Pendapatan <SortIcon col="income" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('hpp')}>
                  HPP Total <SortIcon col="hpp" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('profit')}>
                  Profit <SortIcon col="profit" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => toggleSort('margin')}>
                  Margin <SortIcon col="margin" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const isNegative = row.profit < 0
              const isNoHpp = !row.hasHpp
              return (
                <TableRow
                  key={row.productId}
                  className={isNegative ? 'bg-red-50/50' : isNoHpp ? 'bg-orange-50/30' : undefined}
                >
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {isNegative && <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                      {!isNegative && row.hasHpp && <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />}
                      {isNoHpp && <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                      <div>
                        <p className="text-sm font-medium line-clamp-2">{row.productName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{row.productId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.orderCount}</TableCell>
                  <TableCell className="text-sm">{formatRp(row.attributedIncome)}</TableCell>
                  <TableCell className="text-sm">
                    {row.hasHpp ? formatRp(row.totalHppCost) : (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Belum diisi</Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-sm font-medium ${isNegative ? 'text-red-600' : row.hasHpp ? 'text-green-700' : 'text-muted-foreground'}`}>
                    {row.hasHpp ? formatRp(row.profit) : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.margin !== null ? (
                      <Badge variant={row.margin < 0 ? 'destructive' : row.margin < 10 ? 'secondary' : 'default'} className="text-xs">
                        {row.margin.toFixed(1)}%
                      </Badge>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom tooltip for charts
// ---------------------------------------------------------------------------

function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatRpFull(entry.value)}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

interface Props {
  orders: DbOrder[]
  orderProducts: DbOrderProduct[]
  masterProducts: MasterProduct[]
  adsData: DbAdsRow[]
  noHppCount: number
}

export default function ProfitDashboard({ orders, orderProducts, masterProducts, adsData, noHppCount }: Props) {
  const [trendGroup, setTrendGroup] = useState<'day' | 'week'>('day')
  const [selectedMonth, setSelectedMonth] = useState<string>('all') // 'all' | 'YYYY-MM'

  // Build lookup maps
  const hppMap = useMemo(() => buildHppMap(masterProducts), [masterProducts])
  const orderProductMap = useMemo(() => buildOrderProductMap(orderProducts), [orderProducts])

  // Derive available months from orders
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>()
    for (const o of orders) {
      if (o.order_date) monthSet.add(o.order_date.slice(0, 7))
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a)) // newest first
  }, [orders])

  // Filter orders by selected month
  const filteredOrders = useMemo(() => {
    if (selectedMonth === 'all') return orders
    return orders.filter((o) => o.order_date?.startsWith(selectedMonth))
  }, [orders, selectedMonth])

  // Filter ads data by selected month (match if report period overlaps the month)
  const filteredAdsData = useMemo(() => {
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
      // Include if ad period overlaps with selected month
      return end >= monthStart && start < nextMonth
    })
  }, [adsData, selectedMonth])

  // Calculate all metrics
  const kpis = useMemo(
    () => calculateKpis(filteredOrders, orderProductMap, hppMap, filteredAdsData),
    [filteredOrders, orderProductMap, hppMap, filteredAdsData]
  )
  const feeBreakdown = useMemo(() => calculateFeeBreakdown(filteredOrders), [filteredOrders])
  const trendData = useMemo(
    () => calculateTrend(filteredOrders, trendGroup, orderProductMap, hppMap, filteredAdsData),
    [filteredOrders, trendGroup, orderProductMap, hppMap, filteredAdsData]
  )
  const productRows = useMemo(
    () => calculateProductProfit(filteredOrders, orderProducts, hppMap, filteredAdsData),
    [filteredOrders, orderProducts, hppMap, filteredAdsData]
  )
  const cashFlow = useMemo(() => calculateCashFlowGap(filteredOrders), [filteredOrders])
  const paymentDist = useMemo(() => calculatePaymentDistribution(filteredOrders), [filteredOrders])
  const courierStats = useMemo(() => calculateCourierStats(filteredOrders), [filteredOrders])

  // --- New unified-dashboard analytics ---
  const trafficRows = useMemo(
    () => buildTrafficLightRows(filteredAdsData, masterProducts),
    [filteredAdsData, masterProducts]
  )
  const scaleRecs = useMemo(
    () => buildScaleRecommendations(trafficRows, masterProducts),
    [trafficRows, masterProducts]
  )
  const scalable = useMemo(() => pickScalableCampaigns(scaleRecs), [scaleRecs])
  const busyDays = useMemo(() => calculateBusyDays(filteredOrders), [filteredOrders])
  const topProducts = useMemo(
    () => calculateTopProducts(filteredOrders, orderProducts, masterProducts),
    [filteredOrders, orderProducts, masterProducts]
  )
  const topBuyers = useMemo(() => calculateTopBuyers(filteredOrders), [filteredOrders])
  const dailyDetail = useMemo(() => calculateDailyDetail(filteredOrders), [filteredOrders])

  // Derive avg selling price per product from ads data (most reliable — actual realized price)
  const sellingPriceMap = useMemo(() => {
    const m = new Map<string, number>()
    const agg = new Map<string, { gmv: number; units: number }>()
    for (const a of filteredAdsData) {
      if (!a.product_code || a.product_code === '-') continue
      const e = agg.get(a.product_code) ?? { gmv: 0, units: 0 }
      e.gmv += a.gmv
      e.units += a.units_sold
      agg.set(a.product_code, e)
    }
    for (const [code, { gmv, units }] of Array.from(agg.entries())) {
      if (units > 0) m.set(code, gmv / units)
    }
    // Fallback: derive from orders if no ads data for a product
    return m
  }, [filteredAdsData])

  const negativeProducts = productRows.filter((r) => r.hasHpp && r.profit < 0)
  const totalProducts = masterProducts.length
  const hppFilled = totalProducts - noHppCount
  const hppProgress = totalProducts > 0 ? Math.round((hppFilled / totalProducts) * 100) : 0

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Analisis</h1>
          <p className="text-muted-foreground mt-0.5">
            {filteredOrders.length.toLocaleString('id-ID')} order
          </p>
        </div>
        {/* Month filter */}
        <Select value={selectedMonth} onValueChange={(v) => v && setSelectedMonth(v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Pilih bulan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Periode</SelectItem>
            {availableMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {new Date(`${m}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Alerts */}
      {noHppCount > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <p className="text-orange-800">
                <strong>{noHppCount} dari {totalProducts} produk</strong> belum ada HPP —
                Real Profit belum akurat sebelum semua HPP diisi.
              </p>
              {/* Progress bar */}
              <div className="h-1.5 bg-orange-200 rounded-full overflow-hidden max-w-md">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${hppProgress}%` }}
                />
              </div>
              <p className="text-xs text-orange-700">
                {hppFilled} dari {totalProducts} produk sudah diisi ({hppProgress}%)
              </p>
            </div>
            <Link href="/dashboard/products">
              <Button size="sm" className="h-8 text-xs gap-1 bg-orange-600 hover:bg-orange-700">
                <Package className="h-3 w-3" />
                Isi HPP Sekarang
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {negativeProducts.length > 0 && (
        <Alert variant="destructive">
          <TrendingDown className="h-4 w-4" />
          <AlertDescription>
            <strong>{negativeProducts.length} produk</strong> memiliki profit negatif:{' '}
            {negativeProducts.slice(0, 3).map((p) => p.productName).join(', ')}
            {negativeProducts.length > 3 ? ` dan ${negativeProducts.length - 3} lainnya` : ''}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Total Omzet"
          value={formatRp(kpis.totalOmzet)}
          sub={`${kpis.orderCount.toLocaleString('id-ID')} order`}
          accent="blue"
          icon={ShoppingBag}
          tooltip="Total harga asli semua produk yang terjual (sebelum diskon, voucher, atau fee)."
        />
        <KpiCard
          label="Net Income"
          value={formatRp(kpis.totalNetIncome)}
          sub="Dana yang kamu terima"
          icon={Wallet}
          accent="blue"
          tooltip="Total Penghasilan dari Shopee setelah dipotong semua fee marketplace (komisi, admin, layanan, voucher, dll). Ini yang dana cair ke rekening kamu."
        />
        <KpiCard
          label="Total Biaya"
          value={formatRp(kpis.totalFees)}
          sub="Fee marketplace"
          accent="red"
          icon={Receipt}
          tooltip="Total potongan Shopee: komisi AMS, biaya admin, layanan, voucher seller, cashback, selisih ongkir, dll."
        />
        <KpiCard
          label="Biaya Iklan"
          value={formatRp(kpis.totalAdSpend)}
          sub={kpis.totalAdSpend > 0 ? 'Ad spend' : 'Belum ada'}
          accent={kpis.totalAdSpend > 0 ? 'orange' : 'muted'}
          icon={Zap}
          tooltip="Total biaya iklan yang dikeluarkan untuk mempromosikan produk di platform."
        />
        <KpiCard
          label="Real Profit"
          value={kpis.hasHppData ? formatRp(kpis.realProfit) : '—'}
          accent={kpis.hasHppData ? (kpis.realProfit >= 0 ? 'green' : 'red') : 'muted'}
          sub={
            kpis.hasHppData
              ? noHppCount > 0
                ? `Estimasi (${noHppCount} produk belum HPP)`
                : 'Net Income − HPP & packaging − iklan'
              : 'Isi HPP dulu untuk melihat'
          }
          icon={TrendingUp}
          tooltip="Profit sebenarnya setelah memperhitungkan HPP (harga pokok), biaya packaging, dan biaya iklan. Rumus: Net Income − HPP − Packaging − Biaya Iklan."
          cta={!kpis.hasHppData ? { label: 'Isi HPP produk', href: '/dashboard/products' } : undefined}
        />
        <KpiCard
          label="Profit Margin"
          value={kpis.profitMargin !== null ? `${kpis.profitMargin.toFixed(1)}%` : '—'}
          accent={kpis.profitMargin !== null ? (kpis.profitMargin >= 0 ? 'green' : 'red') : 'muted'}
          sub={kpis.profitMargin !== null ? 'Profit / Omzet' : 'Perlu HPP lengkap'}
          icon={Percent}
          tooltip="Persentase profit terhadap total omzet. Semakin tinggi, semakin efisien bisnis kamu."
        />
      </div>

      {/* Summary formula card — shows how Real Profit is calculated */}
      {kpis.hasHppData && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Info className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1.5 text-sm">
                <p className="font-medium">Cara menghitung Real Profit:</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm font-mono">
                    <span className="text-blue-600">{formatRp(kpis.totalNetIncome)}</span>
                    <span className="text-muted-foreground">(Net Income)</span>
                    <span className="text-muted-foreground">−</span>
                    <span className="text-orange-600">{formatRp(kpis.totalHppCost)}</span>
                    <span className="text-muted-foreground">(HPP + Packaging)</span>
                  </div>
                  {kpis.totalAdSpend > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm font-mono ml-4">
                      <span className="text-muted-foreground">−</span>
                      <span className="text-red-600">{formatRp(kpis.totalAdSpend)}</span>
                      <span className="text-muted-foreground">(Biaya Iklan)</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm font-mono">
                    <span className="text-muted-foreground">=</span>
                    <span className={kpis.realProfit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {formatRp(kpis.realProfit)}
                    </span>
                    <span className="text-muted-foreground font-normal">(Real Profit)</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === SECTION: Scale Recommendations (iklan yang bisa di-scale) === */}
      {filteredAdsData.length > 0 && (
        <ScaleRecommendationsSection scalable={scalable} allRecs={scaleRecs} />
      )}

      {/* === SECTION: ROAS Targets per Product === */}
      {masterProducts.length > 0 && (
        <RoasTargetsSection products={masterProducts} sellingPriceMap={sellingPriceMap} />
      )}

      {/* === SECTION: Trend Chart === */}
      <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Trend Omzet & Profit</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant={trendGroup === 'day' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setTrendGroup('day')}>Harian</Button>
                <Button size="sm" variant={trendGroup === 'week' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setTrendGroup('week')}>Mingguan</Button>
              </div>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">Tidak ada data untuk ditampilkan</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatDate}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatRp(v)} width={80} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="omzet" name="Omzet" stroke="#3b82f6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" dot={false} strokeWidth={2} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

      {/* === SECTION: Busy Days + Top Products + Top Buyers === */}
      <div className="grid md:grid-cols-2 gap-4">
        <BusyDaysSection rows={busyDays} />
        <TopProductsSection rows={topProducts} />
      </div>
      <TopBuyersSection rows={topBuyers} />

      {/* === SECTION: Daily Detail Table === */}
      <DailyDetailSection rows={dailyDetail} />

      {/* === SECTION: Fee Breakdown === */}
      <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Breakdown Biaya</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={feeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      labelLine={false}
                    >
                      {feeBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatRpFull(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Detail Biaya</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {feeBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatRp(item.value)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Total Biaya</span>
                  <span className="text-sm font-bold text-red-600">{formatRp(feeBreakdown.reduce((s, i) => s + i.value, 0))}</span>
                </div>
              </CardContent>
            </Card>
          </div>

      {/* === SECTION: Per Product === */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Profit per Produk</CardTitle></CardHeader>
        <CardContent>
          <ProductProfitTable rows={productRows} />
        </CardContent>
      </Card>

      {/* === SECTION: Payment Distribution === */}
      <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Metode Pembayaran</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={paymentDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="count"
                      nameKey="method"
                    >
                      {paymentDist.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4'][index % 6]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${Number(v)} order`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Detail Pembayaran</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {paymentDist.map((item) => (
                  <div key={item.method} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[140px]">{item.method}</span>
                    <div className="text-right">
                      <p className="font-medium">{item.count} order</p>
                      <p className="text-xs text-muted-foreground">{formatRp(item.amount)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

      {/* === SECTION: Courier === */}
      <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Analisis Kurir</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={courierStats} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="courier" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="orderCount" name="Jumlah Order" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kurir</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Avg Ongkir</TableHead>
                      <TableHead>Total Ongkir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courierStats.map((c) => (
                      <TableRow key={c.courier}>
                        <TableCell className="text-sm font-medium">{c.courier}</TableCell>
                        <TableCell className="text-sm">{c.orderCount}</TableCell>
                        <TableCell className="text-sm">{formatRp(c.avgShippingCost)}</TableCell>
                        <TableCell className="text-sm">{formatRp(c.totalShippingCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

      {/* === SECTION: Cash Flow === */}
      <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Rata-rata Gap</p>
                <p className="text-3xl font-bold text-blue-600">{cashFlow.avgDays} <span className="text-lg font-normal">hari</span></p>
                <p className="text-xs text-muted-foreground mt-1">Order dibuat → dana dilepas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Tercepat</p>
                <p className="text-3xl font-bold text-green-600">{cashFlow.minDays} <span className="text-lg font-normal">hari</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Terlama</p>
                <p className="text-3xl font-bold text-orange-600">{cashFlow.maxDays} <span className="text-lg font-normal">hari</span></p>
                <p className="text-xs text-muted-foreground mt-1">Dari {cashFlow.ordersWithBothDates} order</p>
              </CardContent>
            </Card>
          </div>
    </div>
  )
}
