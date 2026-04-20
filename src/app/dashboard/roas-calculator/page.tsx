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
import { Calculator, Plus, Trash2, Info, TrendingUp } from 'lucide-react'
import {
  PLATFORMS,
  CATEGORIES,
  getAdminFeeRate,
  type Platform,
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
  estimasiUnits: number  // untuk simulasi profit toko
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function emptyVariant(idx: number): Variant {
  return {
    id: uid(),
    name: `Produk ${idx}`,
    hpp: 0,
    hargaJual: 0,
    estimasiRoas: 0,
    estimasiUnits: 0,
  }
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
  // Platform → menentukan shop type list & default fee
  const [platform, setPlatform] = useState<Platform>('shopee')
  const platformCfg = PLATFORMS[platform]

  const [shopType, setShopType] = useState<ShopType>(platformCfg.shopTypes[0].value)
  const [category, setCategory] = useState<string>('other')

  // Default fee state — akan di-reset tiap ganti platform
  const [adminFeeRate, setAdminFeeRate] = useState<number>(() =>
    getAdminFeeRate(platform, platformCfg.shopTypes[0].value, 'other')
  )
  const [ongkirExtraRate, setOngkirExtraRate] = useState<number>(platformCfg.defaults.ongkirExtraRate)
  const [promoExtraRate, setPromoExtraRate] = useState<number>(platformCfg.defaults.promoExtraRate)
  const [biayaPerPesanan, setBiayaPerPesanan] = useState<number>(platformCfg.defaults.biayaPerPesanan)
  const [feeLock, setFeeLock] = useState(false)

  // Preset admin fee dari kombinasi platform × shopType × category
  const presetAdminFee = useMemo(
    () => getAdminFeeRate(platform, shopType, category),
    [platform, shopType, category]
  )

  // Auto-sync admin fee pas preset berubah (kecuali user lock manual)
  useEffect(() => {
    if (!feeLock) setAdminFeeRate(presetAdminFee)
  }, [presetAdminFee, feeLock])

  // Ganti platform → reset shopType & default fee lainnya ke default platform baru
  function handlePlatformChange(p: Platform) {
    setPlatform(p)
    const cfg = PLATFORMS[p]
    setShopType(cfg.shopTypes[0].value)
    setOngkirExtraRate(cfg.defaults.ongkirExtraRate)
    setPromoExtraRate(cfg.defaults.promoExtraRate)
    setBiayaPerPesanan(cfg.defaults.biayaPerPesanan)
    setFeeLock(false)
  }

  // Variants — mulai 3 baris kosong (user tinggal isi)
  const [variants, setVariants] = useState<Variant[]>([
    emptyVariant(1),
    emptyVariant(2),
    emptyVariant(3),
  ])

  function updateVariant(id: string, patch: Partial<Variant>) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }

  function addVariant() {
    setVariants((vs) => [...vs, emptyVariant(vs.length + 1)])
  }

  function removeVariant(id: string) {
    setVariants((vs) => (vs.length > 1 ? vs.filter((v) => v.id !== id) : vs))
  }

  // Per-variant budgeting calculation
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

  // Per-variant SIMULASI (pakai estimasiUnits)
  const simulations = useMemo(() => {
    return variants.map((v, i) => {
      const r = results[i]
      const units = v.estimasiUnits
      const omzet = v.hargaJual * units
      const biayaMarketplace = r.totalPajak * units
      const totalHpp = v.hpp * units
      const biayaIklan = r.estBiayaIklan !== null ? r.estBiayaIklan * units : 0
      const profitBersih = omzet - biayaMarketplace - totalHpp - biayaIklan
      return { units, omzet, biayaMarketplace, totalHpp, biayaIklan, profitBersih, hasIklan: r.estBiayaIklan !== null }
    })
  }, [variants, results])

  const simTotal = useMemo(() => {
    return simulations.reduce(
      (acc, s) => ({
        units: acc.units + s.units,
        omzet: acc.omzet + s.omzet,
        biayaMarketplace: acc.biayaMarketplace + s.biayaMarketplace,
        totalHpp: acc.totalHpp + s.totalHpp,
        biayaIklan: acc.biayaIklan + s.biayaIklan,
        profitBersih: acc.profitBersih + s.profitBersih,
      }),
      { units: 0, omzet: 0, biayaMarketplace: 0, totalHpp: 0, biayaIklan: 0, profitBersih: 0 }
    )
  }, [simulations])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-orange-500" />
          Kalkulator ROAS
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Budgeting produk, target ROAS, dan simulasi profit toko — fee otomatis sesuai platform & kategori.
        </p>
      </div>

      {/* Platform selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Pilih Platform</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(PLATFORMS) as Platform[]).map((p) => {
              const disabled = p === 'tiktok'
              const active = platform === p
              return (
                <button
                  key={p}
                  onClick={() => !disabled && handlePlatformChange(p)}
                  disabled={disabled}
                  title={disabled ? 'Segera hadir' : undefined}
                  className={`relative py-2 px-5 rounded-md border text-sm font-medium transition-colors ${
                    disabled
                      ? 'bg-muted/50 text-muted-foreground border-dashed cursor-not-allowed opacity-70'
                      : active
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-background hover:bg-muted border-border'
                  }`}
                >
                  {PLATFORMS[p].label}
                  {disabled && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 align-middle">
                      Segera hadir
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            * Kalkulator TikTok Shop masih dalam pengembangan dan akan segera tersedia.
          </p>
        </CardContent>
      </Card>

      {/* Shop type / Category / Fee config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Konfigurasi Toko & Biaya</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Biaya otomatis terisi dari preset {platformCfg.label} 2026 — bisa di-override manual.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Tipe Toko</Label>
            <Select
              value={shopType}
              onValueChange={(v) => { if (v) { setShopType(v as ShopType); setFeeLock(false) } }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platformCfg.shopTypes.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {platformCfg.shopTypes.find((s) => s.value === shopType)?.description}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Kategori Produk</Label>
            <Select
              value={category}
              onValueChange={(v) => { if (v) { setCategory(v); setFeeLock(false) } }}
            >
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
              Menentukan preset {platformCfg.labels.adminFee} tahun 2026.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs flex items-center gap-1">
              {platformCfg.labels.adminFee}
              <span className="text-[10px] text-orange-600 font-normal">(auto)</span>
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
                  Reset
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Preset: {(presetAdminFee * 100).toFixed(2)}%
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{platformCfg.labels.ongkirExtra}</Label>
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
            <p className="text-[11px] text-muted-foreground">
              Default: {(platformCfg.defaults.ongkirExtraRate * 100).toFixed(1)}%
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{platformCfg.labels.promoExtra}</Label>
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
            <p className="text-[11px] text-muted-foreground">
              Default: {(platformCfg.defaults.promoExtraRate * 100).toFixed(1)}%
            </p>
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
            <p className="text-[11px] text-muted-foreground">
              Default: Rp {formatRp(platformCfg.defaults.biayaPerPesanan)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Main budgeting table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">3. Budgeting Produk & Target ROAS</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Isi HPP & Harga Jual tiap varian. Target ROAS & Estimasi Biaya Iklan otomatis terisi.
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
                <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-3 w-[220px] sticky left-0 bg-background">
                  Produk
                </th>
                {variants.map((v) => (
                  <th key={v.id} className="py-2 px-2 min-w-[130px]">
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
              <RowInput
                label="HPP"
                variants={variants}
                value={(v) => v.hpp}
                onChange={(v, n) => updateVariant(v.id, { hpp: n })}
                hint="Harga pokok per unit"
                accent="input"
              />
              <RowInput
                label="Harga Jual"
                variants={variants}
                value={(v) => v.hargaJual}
                onChange={(v, n) => updateVariant(v.id, { hargaJual: n })}
                hint="Pastikan sudah riset market"
                accent="input-blue"
              />
              <RowReadonly
                label="Biaya Per Pesanan"
                variants={variants}
                cell={() => formatRp(biayaPerPesanan)}
                hint={`Flat Rp ${formatRp(biayaPerPesanan)} per order`}
                accent="muted"
              />
              <RowReadonly
                label={platformCfg.labels.adminFee}
                variants={variants}
                cell={() => formatPct(adminFeeRate)}
                hint="Dari tipe toko × kategori"
                accent="muted"
              />
              <RowReadonly
                label={platformCfg.labels.ongkirExtra}
                variants={variants}
                cell={() => formatPct(ongkirExtraRate)}
                hint="Program gratis ongkir"
                accent="muted"
              />
              <RowReadonly
                label={platformCfg.labels.promoExtra}
                variants={variants}
                cell={() => formatPct(promoExtraRate)}
                hint="Program cashback / affiliate"
                accent="muted"
              />
              <RowReadonly
                label="Total Biaya"
                variants={variants}
                cell={(_, i) => formatRp(results[i].totalPajak)}
                hint={`Total ${formatPct(adminFeeRate + ongkirExtraRate + promoExtraRate)} × Harga + Biaya per pesanan`}
                accent="muted"
                bold
              />
              <RowReadonly
                label="Gross Profit"
                variants={variants}
                cell={(_, i) => formatRp(results[i].grossProfit)}
                hint="Harga Jual − HPP − Total Biaya"
                accent={(i) =>
                  variants[i].hargaJual === 0 ? 'muted' : results[i].grossProfit >= 0 ? 'green' : 'red'
                }
                bold
              />
              <RowReadonly
                label="% Gross Profit"
                variants={variants}
                cell={(_, i) =>
                  variants[i].hargaJual === 0 ? '—' : formatPct(results[i].grossProfitPct)
                }
                hint="Minimal 40% kalau bisa"
                accent={(i) => {
                  if (variants[i].hargaJual === 0) return 'muted'
                  const p = results[i].grossProfitPct
                  return p >= 0.4 ? 'green' : p >= 0.2 ? 'amber' : 'red'
                }}
                bold
              />

              <tr>
                <td colSpan={variants.length + 2} className="py-2">
                  <div className="border-t border-dashed" />
                </td>
              </tr>

              <RowReadonly
                label="Rugi ROAS (BEP)"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].bepRoas)}
                hint="Di bawah ini = rugi"
                accent="red-bg"
                bold
              />
              <RowReadonly
                label="Target ROAS Kompetitif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetKompetitif)}
                hint="1.7× BEP — cari traffic"
                accent="orange-bg"
                bold
              />
              <RowReadonly
                label="Target ROAS Konservatif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetKonservatif)}
                hint="2.0× BEP — mulai cari profit"
                accent="green-bg"
                bold
              />
              <RowReadonly
                label="Target ROAS Prospektif"
                variants={variants}
                cell={(_, i) => formatRoas(results[i].targetProspektif)}
                hint="4.0× BEP — have fun aja"
                accent="muted"
              />

              <tr>
                <td colSpan={variants.length + 2} className="py-2">
                  <div className="border-t border-dashed" />
                </td>
              </tr>

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
              <RowReadonly
                label="Estimasi Biaya Iklan / Unit"
                variants={variants}
                cell={(_, i) =>
                  results[i].estBiayaIklan !== null ? formatRp(results[i].estBiayaIklan!) : '—'
                }
                hint="Harga Jual ÷ Estimasi ROAS"
                accent="muted"
              />
              <RowReadonly
                label="Estimasi Profit / Unit"
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

      {/* ================================================================= */}
      {/* SIMULASI PROFIT TOKO                                                */}
      {/* ================================================================= */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-green-100 text-green-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">4. Simulasi Profit Toko</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Isi estimasi jumlah terjual per produk. Semua total otomatis terhitung berdasarkan Estimasi ROAS.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs">
                <th className="text-left font-medium text-muted-foreground py-2 pr-3 min-w-[160px]">Produk</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 bg-orange-50/60 min-w-[120px]">
                  Unit Terjual
                </th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 min-w-[110px]">Total Omzet</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 min-w-[130px]">Biaya Marketplace</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 min-w-[110px]">Total HPP</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 min-w-[110px]">Biaya Iklan</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-2 min-w-[120px]">Profit Bersih</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const s = simulations[i]
                return (
                  <tr key={v.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 text-xs font-medium truncate">
                      {v.name || <span className="text-muted-foreground italic">(belum diisi)</span>}
                    </td>
                    <td className="py-1 px-1 bg-orange-50/60">
                      <NumCell
                        value={v.estimasiUnits}
                        onChange={(n) => updateVariant(v.id, { estimasiUnits: n })}
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums">
                      {s.units > 0 ? formatRp(s.omzet) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-red-600">
                      {s.units > 0 ? formatRp(s.biayaMarketplace) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-red-600">
                      {s.units > 0 ? formatRp(s.totalHpp) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-red-600">
                      {s.units > 0 && s.hasIklan
                        ? formatRp(s.biayaIklan)
                        : s.units > 0
                          ? <span className="text-muted-foreground italic text-[10px]">isi ROAS dulu</span>
                          : '—'}
                    </td>
                    <td
                      className={`py-2 px-2 text-right text-xs tabular-nums font-semibold ${
                        s.units === 0
                          ? 'text-muted-foreground'
                          : s.profitBersih >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                      }`}
                    >
                      {s.units > 0 ? formatRp(s.profitBersih) : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              <tr className="bg-muted/40 border-t-2 font-semibold">
                <td className="py-2.5 pr-3 text-xs">TOTAL TOKO</td>
                <td className="py-2.5 px-2 text-right text-xs tabular-nums">
                  {simTotal.units.toLocaleString('id-ID')} unit
                </td>
                <td className="py-2.5 px-2 text-right text-xs tabular-nums">
                  {simTotal.units > 0 ? formatRp(simTotal.omzet) : '—'}
                </td>
                <td className="py-2.5 px-2 text-right text-xs tabular-nums text-red-700">
                  {simTotal.units > 0 ? formatRp(simTotal.biayaMarketplace) : '—'}
                </td>
                <td className="py-2.5 px-2 text-right text-xs tabular-nums text-red-700">
                  {simTotal.units > 0 ? formatRp(simTotal.totalHpp) : '—'}
                </td>
                <td className="py-2.5 px-2 text-right text-xs tabular-nums text-red-700">
                  {simTotal.units > 0 ? formatRp(simTotal.biayaIklan) : '—'}
                </td>
                <td
                  className={`py-2.5 px-2 text-right text-xs tabular-nums font-bold ${
                    simTotal.units === 0
                      ? 'text-muted-foreground'
                      : simTotal.profitBersih >= 0
                        ? 'text-green-700'
                        : 'text-red-700'
                  }`}
                >
                  {simTotal.units > 0 ? formatRp(simTotal.profitBersih) : '—'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* KPI ringkas simulasi */}
          {simTotal.units > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <SimKpi label="Total Omzet" value={formatRp(simTotal.omzet)} accent="blue" />
              <SimKpi
                label="Total Biaya"
                value={formatRp(simTotal.biayaMarketplace + simTotal.totalHpp + simTotal.biayaIklan)}
                accent="red"
                sub={`MP + HPP + Iklan`}
              />
              <SimKpi
                label="Profit Bersih"
                value={formatRp(simTotal.profitBersih)}
                accent={simTotal.profitBersih >= 0 ? 'green' : 'red'}
              />
              <SimKpi
                label="Margin Bersih"
                value={simTotal.omzet > 0 ? `${((simTotal.profitBersih / simTotal.omzet) * 100).toFixed(1)}%` : '—'}
                accent={simTotal.profitBersih >= 0 ? 'green' : 'red'}
                sub="Profit / Omzet"
              />
            </div>
          )}
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
            <p>• Biaya Iklan/Unit = Harga Jual ÷ Estimasi Hasil ROAS</p>
            <p>• Profit Bersih (simulasi) = Omzet − Biaya Marketplace − HPP − Biaya Iklan</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable components
// ---------------------------------------------------------------------------

function SimKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: 'blue' | 'red' | 'green'
}) {
  const colors = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    green: 'text-green-600',
  }
  return (
    <div className="border rounded-md p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${colors[accent]} tabular-nums`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

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
