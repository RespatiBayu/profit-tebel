'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calculator, Plus, Trash2, Info } from 'lucide-react'
import {
  SHOP_TYPES,
  CATEGORIES,
  SHOPEE_DEFAULTS_2026,
  getAdminFeeRate,
  type ShopType,
} from '@/lib/constants/shopee-fees-2026'
import { calculateRoasBudget } from '@/lib/calculations/roas-budget'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface Variant {
  id: string
  name: string
  hpp: number
  hargaJual: number
  estimasiRoas: number
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function makeDefaultVariants(): Variant[] {
  return [
    { id: uid(), name: 'Regular 30ml', hpp: 22064, hargaJual: 59000, estimasiRoas: 3 },
    { id: uid(), name: 'Regular 2ml', hpp: 3966, hargaJual: 10000, estimasiRoas: 4 },
    { id: uid(), name: 'Hampers', hpp: 28530, hargaJual: 89000, estimasiRoas: 4 },
  ]
}

function formatRp(n: number) {
  if (!isFinite(n)) return '—'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

function formatRoas(v: number | null) {
  if (v === null || !isFinite(v)) return '—'
  return `${v.toFixed(2)}x`
}

// ---------------------------------------------------------------------------
// Inline editable cells
// ---------------------------------------------------------------------------

function TextCell({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-center text-xs font-semibold bg-transparent border-0 outline-none focus:ring-1 focus:ring-orange-400 rounded px-1 py-1"
    />
  )
}

function NumCell({
  value,
  onChange,
  step,
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  placeholder?: string
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value))

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? 1}
      value={raw}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        setRaw(e.target.value)
        const n = parseFloat(e.target.value)
        onChange(isNaN(n) ? 0 : n)
      }}
      className="w-full text-right text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-orange-400 rounded px-1 py-1 tabular-nums"
    />
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RoasCalculatorPage() {
  // Shop & category → auto-fill admin fee
  const [shopType, setShopType] = useState<ShopType>('star')
  const [category, setCategory] = useState<string>('beauty')

  // Fee overrides (user bisa edit kalau ga match preset)
  const presetAdminFee = useMemo(() => getAdminFeeRate(shopType, category), [shopType, category])
  const [adminFeeRate, setAdminFeeRate] = useState<number>(presetAdminFee)
  const [ongkirExtraRate, setOngkirExtraRate] = useState<number>(SHOPEE_DEFAULTS_2026.ongkirExtraRate)
  const [promoExtraRate, setPromoExtraRate] = useState<number>(SHOPEE_DEFAULTS_2026.promoExtraRate)
  const [biayaPerPesanan, setBiayaPerPesanan] = useState<number>(SHOPEE_DEFAULTS_2026.biayaPerPesanan)

  // Sync admin fee setiap kali shop/category berubah (replace manual override)
  const [feeLock, setFeeLock] = useState(false) // kalau user ngedit manual, stop auto-sync
  useEffect(() => {
    if (!feeLock) setAdminFeeRate(presetAdminFee)
  }, [presetAdminFee, feeLock])

  // Variants (kolom di tabel)
  const [variants, setVariants] = useState<Variant[]>(makeDefaultVariants())

  function updateVariant(id: string, patch: Partial<Variant>) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }

  function addVariant() {
    setVariants((vs) => [...vs, { id: uid(), name: `Produk ${vs.length + 1}`, hpp: 0, hargaJual: 0, estimasiRoas: 0 }])
  }

  function removeVariant(id: string) {
    setVariants((vs) => (vs.length > 1 ? vs.filter((v) => v.id !== id) : vs))
  }

  // Per-variant calculation
  const results = useMemo(() => {
    return variants.map((v) =>
      calculateRoasBudget({
        hpp: v.hpp,
        hargaJual: v.hargaJual,
        adminFeeRate,
        ongkirExtraRate,
        promoExtraRate,
        biayaPerPesanan,
        estimasiRoas: v.estimasiRoas,
      })
    )
  }, [variants, adminFeeRate, ongkirExtraRate, promoExtraRate, biayaPerPesanan])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-orange-500" />
          Kalkulator ROAS
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Budgeting produk & target ROAS — biaya admin otomatis sesuai tipe toko & kategori (preset Shopee 2026).
        </p>
      </div>

      {/* Shop / Category / Fee config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Konfigurasi Toko & Biaya</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Tipe Toko</Label>
            <Select value={shopType} onValueChange={(v) => { if (v) { setShopType(v as ShopType); setFeeLock(false) } }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOP_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {SHOP_TYPES.find((s) => s.value === shopType)?.description}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Kategori Produk</Label>
            <Select value={category} onValueChange={(v) => { if (v) { setCategory(v); setFeeLock(false) } }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Menentukan preset Biaya Admin di Shopee 2026.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs flex items-center gap-1">
              Biaya Admin
              <span className="text-[10px] text-orange-600 font-normal">(auto dari toko × kategori)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step={0.01}
                value={(adminFeeRate * 100).toFixed(2)}
                onChange={(e) => {
                  setFeeLock(true)
                  const n = parseFloat(e.target.value)
                  setAdminFeeRate(isNaN(n) ? 0 : n / 100)
                }}
                className="h-9 text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
              {feeLock && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => { setFeeLock(false); setAdminFeeRate(presetAdminFee) }}
                >
                  Reset preset
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Preset: {(presetAdminFee * 100).toFixed(2)}% — bisa di-override manual.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Ongkir Extra (Gratis Ongkir XTRA)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step={0.01}
                value={(ongkirExtraRate * 100).toFixed(2)}
                onChange={(e) => setOngkirExtraRate((parseFloat(e.target.value) || 0) / 100)}
                className="h-9 text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Default Shopee: 4%</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Promo Extra (Cashback Extra)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step={0.01}
                value={(promoExtraRate * 100).toFixed(2)}
                onChange={(e) => setPromoExtraRate((parseFloat(e.target.value) || 0) / 100)}
                className="h-9 text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Default Shopee: 4.5%</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Biaya Per Pesanan</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Rp</span>
              <Input
                type="number"
                value={biayaPerPesanan}
                onChange={(e) => setBiayaPerPesanan(parseFloat(e.target.value) || 0)}
                className="h-9 text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Flat biaya proses per order. Default: Rp 1.250</p>
          </div>
        </CardContent>
      </Card>

      {/* Main table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Budgeting Produk & Target ROAS</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Isi HPP & Harga Jual tiap varian. Target ROAS & estimasi profit otomatis terisi.
            </p>
          </div>
          <Button size="sm" onClick={addVariant} className="gap-1 bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="h-3 w-3" /> Tambah Produk
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-3 w-[240px] sticky left-0 bg-background">
                  Produk
                </th>
                {variants.map((v) => (
                  <th key={v.id} className="py-2 px-2 min-w-[140px]">
                    <div className="flex items-center gap-1">
                      <TextCell
                        value={v.name}
                        onChange={(name) => updateVariant(v.id, { name })}
                        placeholder="Nama produk"
                      />
                      {variants.length > 1 && (
                        <button
                          onClick={() => removeVariant(v.id)}
                          className="text-muted-foreground hover:text-red-500 shrink-0"
                          title="Hapus produk"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-left text-[11px] text-muted-foreground py-2 pl-3 w-[200px]">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {/* HPP (input) */}
              <RowInput
                label="HPP"
                variants={variants}
                value={(v) => v.hpp}
                onChange={(v, n) => updateVariant(v.id, { hpp: n })}
                hint="Harga pokok per unit"
                accent="input"
              />
              {/* Harga Jual (input) */}
              <RowInput
                label="Harga Jual"
                variants={variants}
                value={(v) => v.hargaJual}
                onChange={(v, n) => updateVariant(v.id, { hargaJual: n })}
                hint="Pastikan sudah riset market"
                accent="input-blue"
              />
              {/* Biaya Per Pesanan (readonly uniform) */}
              <RowReadonly
                label="Biaya Per Pesanan"
                variants={variants}
                cell={() => formatRp(biayaPerPesanan)}
                hint={`Flat Rp ${formatRp(biayaPerPesanan)} per order`}
                accent="muted"
              />
              {/* Admin Fee */}
              <RowReadonly
                label="Admin Fee"
                variants={variants}
                cell={() => formatPct(adminFeeRate)}
                hint="Dari tipe toko × kategori"
                accent="muted"
              />
              {/* Ongkir Extra */}
              <RowReadonly
                label="Ongkir Extra"
                variants={variants}
                cell={() => formatPct(ongkirExtraRate)}
                hint="Program Gratis Ongkir XTRA"
                accent="muted"
              />
              {/* Promo Extra */}
              <RowReadonly
                label="Promo Extra"
                variants={variants}
                cell={() => formatPct(promoExtraRate)}
                hint="Program Cashback Extra"
                accent="muted"
              />
              {/* Total Pajak */}
              <RowReadonly
                label="Total Biaya"
                variants={variants}
                cell={(_, i) => formatRp(results[i].totalPajak)}
                hint={`Total ${formatPct(adminFeeRate + ongkirExtraRate + promoExtraRate)} × Harga + Biaya per pesanan`}
                accent="muted"
                bold
              />
              {/* Gross Profit */}
              <RowReadonly
                label="Gross Profit"
                variants={variants}
                cell={(_, i) => formatRp(results[i].grossProfit)}
                hint="Harga Jual − HPP − Total Biaya"
                accent={(i) => (results[i].grossProfit >= 0 ? 'green' : 'red')}
                bold
              />
              {/* % Gross Profit */}
              <RowReadonly
                label="% Gross Profit"
                variants={variants}
                cell={(_, i) => formatPct(results[i].grossProfitPct)}
                hint="Minimal 40% kalau bisa"
                accent={(i) => (results[i].grossProfitPct >= 0.4 ? 'green' : results[i].grossProfitPct >= 0.2 ? 'amber' : 'red')}
                bold
              />

              {/* Separator */}
              <tr>
                <td colSpan={variants.length + 2} className="py-2">
                  <div className="border-t border-dashed" />
                </td>
              </tr>

              {/* Rugi ROAS (BEP) */}
              <RowReadonly
                label="Rugi ROAS (BEP)"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].bepRoas)}
                hint="Di bawah ini = rugi"
                accent="red-bg"
                bold
              />
              {/* Target ROAS Kompetitif */}
              <RowReadonly
                label="Target ROAS Kompetitif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetKompetitif)}
                hint="1.7× BEP — cari traffic (produk baru / pindahan GMV Max Auto)"
                accent="orange-bg"
                bold
              />
              {/* Target ROAS Konservatif */}
              <RowReadonly
                label="Target ROAS Konservatif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetKonservatif)}
                hint="2.0× BEP — mulai cari profit"
                accent="green-bg"
                bold
              />
              {/* Target ROAS Prospektif */}
              <RowReadonly
                label="Target ROAS Prospektif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetProspektif)}
                hint="4.0× BEP — have fun aja (bukan untuk produk winning)"
                accent="muted"
              />

              {/* Separator */}
              <tr>
                <td colSpan={variants.length + 2} className="py-2">
                  <div className="border-t border-dashed" />
                </td>
              </tr>

              {/* Estimasi Hasil ROAS (input) */}
              <RowInput
                label="Estimasi Hasil ROAS"
                variants={variants}
                value={(v) => v.estimasiRoas}
                onChange={(v, n) => updateVariant(v.id, { estimasiRoas: n })}
                hint="ROAS realistis yang kamu targetkan"
                accent="input"
                step={0.1}
                placeholder="0.0"
                suffix="x"
              />
              {/* Estimasi Biaya Iklan */}
              <RowReadonly
                label="Estimasi Biaya Iklan"
                variants={variants}
                cell={(_, i) =>
                  results[i].estBiayaIklan !== null ? formatRp(results[i].estBiayaIklan!) : '—'
                }
                hint="Harga Jual ÷ Estimasi ROAS"
                accent="muted"
              />
              {/* Estimasi Profit */}
              <RowReadonly
                label="Estimasi Profit"
                variants={variants}
                cell={(_, i) =>
                  results[i].estProfit !== null ? formatRp(results[i].estProfit!) : '—'
                }
                hint="Gross Profit − Estimasi Biaya Iklan"
                accent={(i) => {
                  const p = results[i].estProfit
                  if (p === null) return 'muted'
                  return p >= 0 ? 'green' : 'red'
                }}
                bold
              />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Info footer */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Rumus:</strong></p>
            <p>• Total Biaya = (Admin% + Ongkir% + Promo%) × Harga Jual + Biaya Per Pesanan</p>
            <p>• Gross Profit = Harga Jual − HPP − Total Biaya</p>
            <p>• BEP ROAS = Harga Jual ÷ Gross Profit</p>
            <p>• Target ROAS: Kompetitif = 1.7× BEP · Konservatif = 2.0× BEP · Prospektif = 4.0× BEP</p>
            <p>• Estimasi Biaya Iklan = Harga Jual ÷ Estimasi Hasil ROAS</p>
            <p>• Estimasi Profit = Gross Profit − Estimasi Biaya Iklan</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable table rows
// ---------------------------------------------------------------------------

type RowAccent =
  | 'input'
  | 'input-blue'
  | 'muted'
  | 'green'
  | 'red'
  | 'amber'
  | 'red-bg'
  | 'orange-bg'
  | 'green-bg'

function accentCellClass(a: RowAccent): string {
  switch (a) {
    case 'input':
      return 'bg-orange-50/60'
    case 'input-blue':
      return 'bg-blue-50/60'
    case 'green':
      return 'text-green-700 font-medium'
    case 'red':
      return 'text-red-600 font-medium'
    case 'amber':
      return 'text-amber-600 font-medium'
    case 'red-bg':
      return 'bg-red-500 text-white font-semibold'
    case 'orange-bg':
      return 'bg-orange-500 text-white font-semibold'
    case 'green-bg':
      return 'bg-green-500 text-white font-semibold'
    case 'muted':
    default:
      return ''
  }
}

function RowInput({
  label,
  variants,
  value,
  onChange,
  hint,
  accent = 'input',
  step,
  placeholder,
  suffix,
}: {
  label: string
  variants: Variant[]
  value: (v: Variant) => number
  onChange: (v: Variant, n: number) => void
  hint?: string
  accent?: RowAccent
  step?: number
  placeholder?: string
  suffix?: string
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="text-left text-xs font-medium py-1.5 pr-3 sticky left-0 bg-background">
        {label}
      </td>
      {variants.map((v) => (
        <td key={v.id} className={`py-1.5 px-1 ${accentCellClass(accent)}`}>
          <div className="flex items-center">
            <NumCell
              value={value(v)}
              onChange={(n) => onChange(v, n)}
              step={step}
              placeholder={placeholder}
            />
            {suffix && <span className="text-[10px] text-muted-foreground pr-1">{suffix}</span>}
          </div>
        </td>
      ))}
      <td className="text-[11px] text-muted-foreground pl-3">{hint}</td>
    </tr>
  )
}

function RowReadonly({
  label,
  variants,
  cell,
  hint,
  accent = 'muted',
  bold = false,
}: {
  label: string
  variants: Variant[]
  cell: (v: Variant, i: number) => string
  hint?: string
  accent?: RowAccent | ((i: number) => RowAccent)
  bold?: boolean
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className={`text-left text-xs py-1.5 pr-3 sticky left-0 bg-background ${bold ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </td>
      {variants.map((v, i) => {
        const a = typeof accent === 'function' ? accent(i) : accent
        return (
          <td
            key={v.id}
            className={`py-1.5 px-2 text-right text-xs tabular-nums ${bold ? 'font-semibold' : ''} ${accentCellClass(a)}`}
          >
            {cell(v, i)}
          </td>
        )
      })}
      <td className="text-[11px] text-muted-foreground pl-3">{hint}</td>
    </tr>
  )
}
