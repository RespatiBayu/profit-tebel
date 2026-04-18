'use client'

/**
 * Section components for the unified Analisis Dashboard.
 * Each export is a self-contained section card rendered inline on the page
 * (NOT inside a tab). Keeps the page one continuous scroll.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Cell,
} from 'recharts'
import {
  Flame,
  Target,
  Users,
  CalendarDays,
  Award,
  AlertTriangle,
} from 'lucide-react'
import type {
  BusyDayRow,
  TopProductRow,
  TopBuyerRow,
  DailyDetailRow,
} from '@/lib/calculations/dashboard-analytics'
import type {
  CampaignScaleRec,
  RoasTargets,
} from '@/lib/calculations/roas-recommendations'
import type { MasterProduct } from '@/types'
import { computeRoasTargets } from '@/lib/calculations/roas-recommendations'

// ---------------------------------------------------------------------------
// Formatting helpers (duplicated to keep this file self-contained)
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

// ---------------------------------------------------------------------------
// 1. Scale Recommendations — "Iklan yang bisa di-SCALE"
// ---------------------------------------------------------------------------

export function ScaleRecommendationsSection({
  scalable,
  allRecs,
}: {
  scalable: CampaignScaleRec[]
  allRecs: CampaignScaleRec[]
}) {
  const needsAttention = allRecs.filter(
    (r) => r.decision === 'optimize_first' && r.adSpend > 100_000,
  )

  return (
    <div className="space-y-4">
      <Card className="border-green-200 bg-gradient-to-br from-green-50/50 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-green-600" />
                Iklan yang Bisa Di-SCALE
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                ROAS di atas target Kompetitif, konversi ≥ 5, ad spend ≥ Rp 100rb.
                Siap dipindah ke GMV Max ROAS dengan target yang direkomendasikan.
              </p>
            </div>
            <Badge className="bg-green-600 text-white">
              {scalable.length} campaign siap
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {scalable.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Belum ada campaign yang lolos kriteria scale. Optimize yang{' '}
              <Badge variant="outline" className="text-[10px] text-yellow-700">
                OPTIMIZE
              </Badge>{' '}
              dulu untuk naikkan ROAS.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Campaign</TableHead>
                    <TableHead>ROAS Skrg</TableHead>
                    <TableHead>Konversi</TableHead>
                    <TableHead>Ad Spend</TableHead>
                    <TableHead className="bg-green-100/50 font-semibold text-green-900">
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Target ROAS
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[260px]">Rekomendasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scalable.map((r) => (
                    <TableRow
                      key={`${r.adName ?? r.productCode}-${r.productCode}`}
                      className="bg-green-50/30"
                    >
                      <TableCell>
                        <p className="text-sm font-medium line-clamp-2">
                          {r.adName ?? r.productName}
                        </p>
                        {r.productCode !== '-' && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {r.productCode}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-semibold text-green-700">
                          {r.currentRoas.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{r.conversions}</TableCell>
                      <TableCell className="text-sm">{formatRp(r.adSpend)}</TableCell>
                      <TableCell className="bg-green-100/30">
                        {r.recommendedRoasTarget !== null ? (
                          <span className="text-lg font-bold text-green-700">
                            {r.recommendedRoasTarget.toFixed(2)}x
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground">{r.reasoning}</p>
                        {r.projectedProfit !== null && (
                          <p className="text-xs mt-1">
                            Proyeksi +50% spend:{' '}
                            <span className="font-medium text-green-700">
                              Profit {formatRp(r.projectedProfit)}
                            </span>
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warning: campaigns burning money */}
      {needsAttention.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {needsAttention.length} Campaign Rugi — Optimize Dulu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {needsAttention.slice(0, 5).map((r) => (
                <div
                  key={`${r.adName}-${r.productCode}`}
                  className="flex items-center justify-between gap-3 text-sm border-b border-red-100 pb-2 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.adName ?? r.productName}</p>
                    <p className="text-xs text-muted-foreground">{r.reasoning}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">ROAS</p>
                    <p className="font-bold text-red-600">{r.currentRoas.toFixed(2)}x</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. ROAS Targets Table — BEP & 3 tier targets per produk
// ---------------------------------------------------------------------------

export function RoasTargetsSection({
  products,
  sellingPriceMap,
}: {
  products: MasterProduct[]
  /** product_id → avg selling price (derived from orders or ads GMV) */
  sellingPriceMap: Map<string, number>
}) {
  const rows = products
    .filter((p) => p.hpp > 0 && (sellingPriceMap.get(p.marketplace_product_id) ?? 0) > 0)
    .map((p) => {
      const price = sellingPriceMap.get(p.marketplace_product_id) ?? 0
      const targets = computeRoasTargets(p, price)
      return { product: p, price, targets }
    })
    .filter((r): r is { product: MasterProduct; price: number; targets: RoasTargets } => r.targets !== null && r.targets.grossProfit > 0)
    .sort((a, b) => b.targets.grossProfitPct - a.targets.grossProfitPct)

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Target ROAS per Produk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada produk dengan HPP lengkap & data order untuk kalkulasi ROAS.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          Target ROAS per Produk
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Minimum ROAS yang harus dicapai supaya iklan nggak rugi (BEP) + 3 tier target untuk scale.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Produk</TableHead>
                <TableHead>Harga Jual</TableHead>
                <TableHead>Gross Profit</TableHead>
                <TableHead className="bg-red-100/40 text-red-800 font-semibold">
                  BEP
                </TableHead>
                <TableHead className="bg-orange-100/40 text-orange-800 font-semibold">
                  Kompetitif
                </TableHead>
                <TableHead className="bg-green-100/40 text-green-800 font-semibold">
                  Konservatif
                </TableHead>
                <TableHead className="bg-blue-100/40 text-blue-800 font-semibold">
                  Prospektif
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ product, targets }) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <p className="text-sm font-medium line-clamp-2">{product.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {product.marketplace_product_id}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{formatRp(targets.sellingPrice)}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{formatRp(targets.grossProfit)}</p>
                    <p className="text-xs text-muted-foreground">
                      {(targets.grossProfitPct * 100).toFixed(1)}%
                    </p>
                  </TableCell>
                  <TableCell className="bg-red-50/60 font-bold text-red-700">
                    {targets.bepRoas.toFixed(2)}x
                  </TableCell>
                  <TableCell className="bg-orange-50/60 font-semibold text-orange-700">
                    {targets.kompetitifRoas.toFixed(2)}x
                  </TableCell>
                  <TableCell className="bg-green-50/60 font-semibold text-green-700">
                    {targets.konservatifRoas.toFixed(2)}x
                  </TableCell>
                  <TableCell className="bg-blue-50/60 font-semibold text-blue-700">
                    {targets.prospektifRoas.toFixed(2)}x
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 text-xs text-muted-foreground flex gap-4 flex-wrap">
          <span>
            <Badge variant="outline" className="text-[10px] text-red-700 border-red-300">BEP</Badge>{' '}
            break-even (rugi kalau di bawah)
          </span>
          <span>
            <Badge variant="outline" className="text-[10px] text-orange-700 border-orange-300">Kompetitif</Badge>{' '}
            1.7× BEP — scale agresif
          </span>
          <span>
            <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Konservatif</Badge>{' '}
            2× BEP — scale aman
          </span>
          <span>
            <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">Prospektif</Badge>{' '}
            4× BEP — margin tebal
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. Busy Days Chart
// ---------------------------------------------------------------------------

export function BusyDaysSection({ rows }: { rows: BusyDayRow[] }) {
  const maxOrders = Math.max(...rows.map((r) => r.orderCount), 1)
  const busiestDay = rows.reduce((best, r) => (r.orderCount > best.orderCount ? r : best), rows[0])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Hari Paling Ramai
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {busiestDay.orderCount > 0
                ? `Paling ramai: ${busiestDay.dayName} (${busiestDay.orderCount} order)`
                : 'Belum ada data order'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="dayName" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => {
                const num = Number(v)
                return name === 'Order' ? `${num} order` : formatRpFull(num)
              }}
              contentStyle={{ fontSize: '12px' }}
            />
            <Bar dataKey="orderCount" name="Order" radius={[6, 6, 0, 0]}>
              {rows.map((row, i) => (
                <Cell
                  key={i}
                  fill={row.orderCount === maxOrders ? '#10b981' : '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4. Top Products
// ---------------------------------------------------------------------------

export function TopProductsSection({ rows }: { rows: TopProductRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4 text-yellow-600" />
          Top 5 Produk
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada data produk dari order.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={r.productId}
                className="flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    i === 0
                      ? 'bg-yellow-100 text-yellow-700'
                      : i === 1
                        ? 'bg-zinc-200 text-zinc-700'
                        : i === 2
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{r.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.orderCount} order · {r.unitsSold} unit
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatRp(r.omzet)}</p>
                  {r.hasHpp && (
                    <p
                      className={`text-xs ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      Profit {formatRp(r.profit)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 5. Top Buyers
// ---------------------------------------------------------------------------

export function TopBuyersSection({ rows }: { rows: TopBuyerRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-600" />
          Top 5 Pembeli
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Data buyer belum tersedia.
            </p>
            <p className="text-xs text-muted-foreground">
              Re-upload Data Penghasilan Shopee untuk populate username pembeli.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={r.buyerUsername}
                className="flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.buyerName ?? r.buyerUsername}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    @{r.buyerUsername}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatRp(r.totalOmzet)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.orderCount} order · avg {formatRp(r.avgOrderValue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 6. Daily Detail Table
// ---------------------------------------------------------------------------

export function DailyDetailSection({ rows }: { rows: DailyDetailRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Detail per Tanggal
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Breakdown omzet, diskon, dan fee setiap hari. Hari ramai ditandai.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Harga Asli</TableHead>
                <TableHead>Diskon</TableHead>
                <TableHead>Penghasilan Bersih</TableHead>
                <TableHead>Biaya Admin</TableHead>
                <TableHead>Biaya Layanan</TableHead>
                <TableHead>% Potongan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-sm">
                    Belum ada data order
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <span>{r.orderCount}</span>
                        {r.isBusy && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100">
                            Ramai
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatRp(r.omzet)}</TableCell>
                    <TableCell className="text-sm text-red-600">
                      -{formatRp(r.discount)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatRp(r.netIncome)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      -{formatRp(r.adminFee)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      -{formatRp(r.serviceFee)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          r.deductionPct > 0.15
                            ? 'text-red-700 border-red-300'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {(r.deductionPct * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
