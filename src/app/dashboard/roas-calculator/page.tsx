'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MARKETPLACE_FEES, MARKETPLACE_OPTIONS } from '@/lib/constants/marketplace-fees'
import type { MarketplaceKey } from '@/lib/constants/marketplace-fees'
import { calculateRoas } from '@/lib/calculations/roas'
import type { RoasInputs } from '@/lib/calculations/roas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, XCircle, Save, Trash2, ChevronDown, ChevronUp, Calculator } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedScenario {
  id: string
  scenario_name: string
  marketplace: string
  selling_price: number
  hpp: number
  packaging_cost: number
  commission_rate: number
  admin_fee_rate: number
  service_fee_rate: number
  processing_fee: number
  estimated_shipping: number
  seller_voucher: number
  target_roas: number
  estimated_cr: number
  estimated_cpc: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRp(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function numInput(val: number) {
  return val === 0 ? '' : String(val)
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ---------------------------------------------------------------------------
// Default inputs by marketplace
// ---------------------------------------------------------------------------

function defaultInputs(marketplace: MarketplaceKey): RoasInputs {
  const fees = MARKETPLACE_FEES[marketplace]
  return {
    marketplace,
    sellingPrice: 0,
    hpp: 0,
    packagingCost: 0,
    commissionRate: fees.adminFeeRate,
    adminFeeRate: fees.serviceFeeRate,
    serviceFeeRate: 0,
    processingFee: fees.processingFee,
    estimatedShipping: fees.estimatedShippingRange.average,
    sellerVoucher: 0,
    targetRoas: 3.0,
    estimatedCr: 0.02,
    estimatedCpc: 500,
  }
}

// ---------------------------------------------------------------------------
// Sub-component: ResultCard
// ---------------------------------------------------------------------------

function ResultCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: NumberField
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  hint,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  prefix?: string
  hint?: string
  step?: number
}) {
  const [raw, setRaw] = useState(numInput(value))

  // Sync when value changes externally (e.g. marketplace preset)
  useEffect(() => {
    setRaw(numInput(value))
  }, [value])

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          step={step ?? 1}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            onChange(parseNum(e.target.value))
          }}
          className={prefix ? 'pl-7 text-sm h-8' : 'text-sm h-8'}
          placeholder="0"
        />
        {suffix && (
          <span className="absolute right-2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RoasCalculatorPage() {
  const supabase = createClient()

  const [marketplace, setMarketplace] = useState<MarketplaceKey>('shopee')
  const [inputs, setInputs] = useState<RoasInputs>(defaultInputs('shopee'))
  const [scenarioName, setScenarioName] = useState('')
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [saving, setSaving] = useState(false)
  const [showFees, setShowFees] = useState(false)
  const [showBudget, setShowBudget] = useState(false)

  // Load scenarios on mount
  const loadScenarios = useCallback(async () => {
    const { data } = await supabase
      .from('roas_scenarios')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setSavedScenarios(data as SavedScenario[])
  }, [supabase])

  useEffect(() => {
    loadScenarios()
  }, [loadScenarios])

  // When marketplace changes, update fee presets but keep prices
  function handleMarketplaceChange(mp: MarketplaceKey) {
    setMarketplace(mp)
    const fees = MARKETPLACE_FEES[mp]
    setInputs((prev) => ({
      ...prev,
      marketplace: mp,
      commissionRate: fees.adminFeeRate,
      adminFeeRate: fees.serviceFeeRate,
      serviceFeeRate: 0,
      processingFee: fees.processingFee,
      estimatedShipping: fees.estimatedShippingRange.average,
    }))
  }

  function setField<K extends keyof RoasInputs>(key: K, value: RoasInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  // Real-time calculation
  const results = useMemo(() => {
    if (inputs.sellingPrice <= 0) return null
    return calculateRoas(inputs)
  }, [inputs])

  // Save scenario
  async function handleSave() {
    if (!scenarioName.trim()) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('roas_scenarios').insert({
        user_id: user.id,
        scenario_name: scenarioName.trim(),
        marketplace: inputs.marketplace,
        selling_price: inputs.sellingPrice,
        hpp: inputs.hpp,
        packaging_cost: inputs.packagingCost,
        commission_rate: inputs.commissionRate,
        admin_fee_rate: inputs.adminFeeRate,
        service_fee_rate: inputs.serviceFeeRate,
        processing_fee: inputs.processingFee,
        estimated_shipping: inputs.estimatedShipping,
        seller_voucher: inputs.sellerVoucher,
        target_roas: inputs.targetRoas,
        estimated_cr: inputs.estimatedCr,
        estimated_cpc: inputs.estimatedCpc,
      })

      setScenarioName('')
      await loadScenarios()
    } finally {
      setSaving(false)
    }
  }

  // Load scenario into form
  function handleLoadScenario(s: SavedScenario) {
    setMarketplace(s.marketplace as MarketplaceKey)
    setInputs({
      marketplace: s.marketplace as MarketplaceKey,
      sellingPrice: s.selling_price,
      hpp: s.hpp,
      packagingCost: s.packaging_cost,
      commissionRate: s.commission_rate,
      adminFeeRate: s.admin_fee_rate,
      serviceFeeRate: s.service_fee_rate,
      processingFee: s.processing_fee,
      estimatedShipping: s.estimated_shipping,
      sellerVoucher: s.seller_voucher,
      targetRoas: s.target_roas,
      estimatedCr: s.estimated_cr,
      estimatedCpc: s.estimated_cpc,
    })
  }

  // Delete scenario
  async function handleDeleteScenario(id: string) {
    await supabase.from('roas_scenarios').delete().eq('id', id)
    await loadScenarios()
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-orange-500" />
          ROAS Calculator
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hitung break-even ROAS, maksimum budget iklan, dan simulasi profit sebelum beriklan.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT PANEL — Inputs                                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          {/* Marketplace selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Marketplace</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {MARKETPLACE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleMarketplaceChange(opt.value as MarketplaceKey)}
                    className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                      marketplace === opt.value
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Product pricing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Harga &amp; Biaya Produk</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <NumberField
                  label="Harga Jual (Rp)"
                  value={inputs.sellingPrice}
                  onChange={(v) => setField('sellingPrice', v)}
                  prefix="Rp"
                  hint="Harga yang tampil di marketplace"
                />
              </div>
              <NumberField
                label="HPP / Unit (Rp)"
                value={inputs.hpp}
                onChange={(v) => setField('hpp', v)}
                prefix="Rp"
              />
              <NumberField
                label="Biaya Packaging (Rp)"
                value={inputs.packagingCost}
                onChange={(v) => setField('packagingCost', v)}
                prefix="Rp"
              />
              <div className="col-span-2">
                <NumberField
                  label="Voucher Seller (Rp)"
                  value={inputs.sellerVoucher}
                  onChange={(v) => setField('sellerVoucher', v)}
                  prefix="Rp"
                  hint="Per unit yang kamu tanggung"
                />
              </div>
            </CardContent>
          </Card>

          {/* Marketplace fees — collapsible */}
          <Card>
            <button
              className="w-full flex items-center justify-between p-4 text-left"
              onClick={() => setShowFees((v) => !v)}
            >
              <span className="font-semibold text-base">Biaya Marketplace</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Preset: {MARKETPLACE_FEES[marketplace].name}
                </span>
                {showFees ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
            {showFees && (
              <CardContent className="grid grid-cols-2 gap-3 pt-0">
                <NumberField
                  label="Komisi / Admin Fee (%)"
                  value={inputs.commissionRate * 100}
                  onChange={(v) => setField('commissionRate', v / 100)}
                  suffix="%"
                  step={0.01}
                />
                <NumberField
                  label="Service Fee (%)"
                  value={inputs.adminFeeRate * 100}
                  onChange={(v) => setField('adminFeeRate', v / 100)}
                  suffix="%"
                  step={0.01}
                />
                <NumberField
                  label="Transaction Fee (%)"
                  value={inputs.serviceFeeRate * 100}
                  onChange={(v) => setField('serviceFeeRate', v / 100)}
                  suffix="%"
                  step={0.01}
                />
                <NumberField
                  label="Processing Fee (Rp)"
                  value={inputs.processingFee}
                  onChange={(v) => setField('processingFee', v)}
                  prefix="Rp"
                />
                <div className="col-span-2">
                  <NumberField
                    label="Estimasi Ongkir (Rp)"
                    value={inputs.estimatedShipping}
                    onChange={(v) => setField('estimatedShipping', v)}
                    prefix="Rp"
                    hint="Ongkir yang kamu tanggung per pesanan"
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Ad simulation inputs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Target &amp; Estimasi Iklan</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <NumberField
                  label="Target ROAS"
                  value={inputs.targetRoas}
                  onChange={(v) => setField('targetRoas', v)}
                  suffix="x"
                  step={0.1}
                  hint="ROAS yang ingin kamu capai"
                />
              </div>
              <NumberField
                label="Est. Conversion Rate (%)"
                value={inputs.estimatedCr * 100}
                onChange={(v) => setField('estimatedCr', v / 100)}
                suffix="%"
                step={0.1}
                hint="% pengunjung yang beli"
              />
              <NumberField
                label="Est. CPC (Rp)"
                value={inputs.estimatedCpc}
                onChange={(v) => setField('estimatedCpc', v)}
                prefix="Rp"
                hint="Biaya per klik iklan"
              />
            </CardContent>
          </Card>

          {/* Save scenario */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Simpan Skenario</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                placeholder="Nama skenario..."
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="text-sm h-8"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!scenarioName.trim() || saving}
                className="gap-1 bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              >
                <Save className="h-3 w-3" />
                Simpan
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT PANEL — Results                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          {!results ? (
            <Card className="flex items-center justify-center min-h-[300px]">
              <div className="text-center text-muted-foreground">
                <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Masukkan harga jual untuk melihat hasil kalkulasi.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Feasibility banner */}
              <Card className={results.isFeasible ? 'border-green-500' : 'border-red-400'}>
                <CardContent className="py-4 flex items-start gap-3">
                  {results.isFeasible ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm">{results.feasibilityNote}</p>
                </CardContent>
              </Card>

              {/* Break-even summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Break-Even Analysis</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <ResultCard
                    label="Total COGS"
                    value={formatRp(results.totalCogs)}
                    sub="HPP + Packaging"
                  />
                  <ResultCard
                    label="Total Biaya Marketplace"
                    value={formatRp(results.totalFees)}
                    sub="Komisi + fee + ongkir + voucher"
                  />
                  <ResultCard
                    label="Net Revenue / Unit"
                    value={formatRp(results.netRevenuePerUnit)}
                    sub="Setelah biaya marketplace"
                  />
                  <ResultCard
                    label="Profit Sebelum Iklan"
                    value={formatRp(results.profitBeforeAds)}
                    sub="Margin jika ROAS = infinite"
                  />
                  <Separator className="col-span-2" />
                  <ResultCard
                    label="Break-Even ROAS"
                    value={
                      results.breakEvenRoas > 0
                        ? `${results.breakEvenRoas.toFixed(2)}x`
                        : 'N/A'
                    }
                    sub="Min ROAS agar tidak rugi"
                  />
                  <ResultCard
                    label="Maks. Ad Spend / Unit"
                    value={formatRp(results.breakEvenAdSpend)}
                    sub="Di atas ini = rugi"
                  />
                </CardContent>
              </Card>

              {/* At target ROAS */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Pada Target ROAS</CardTitle>
                    <Badge variant="outline">{inputs.targetRoas.toFixed(1)}x</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <ResultCard
                    label="Maks. Ad Spend / Unit"
                    value={formatRp(results.maxAdSpendAtTarget)}
                    sub={`Harga jual / ROAS target`}
                  />
                  <ResultCard
                    label="Acceptable CPA"
                    value={formatRp(results.acceptableCpa)}
                    sub="Maks. biaya per konversi"
                  />
                  <div className="col-span-2">
                    <ResultCard
                      label="Est. Profit / Unit"
                      value={formatRp(results.profitAtTargetRoas)}
                      sub={
                        results.profitAtTargetRoas >= 0
                          ? 'Untung per unit terjual'
                          : 'Rugi per unit — kurangi biaya atau naikkan harga'
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Budget simulation — collapsible */}
              <Card>
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setShowBudget((v) => !v)}
                >
                  <span className="font-semibold text-base">Simulasi Budget Rp 1 Juta</span>
                  {showBudget ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showBudget && (
                  <CardContent className="grid grid-cols-2 gap-4 pt-0">
                    <ResultCard
                      label="Est. Klik"
                      value={Math.round(results.estimatedClicks).toLocaleString('id-ID')}
                      sub={`Rp 1jt / CPC ${formatRp(inputs.estimatedCpc)}`}
                    />
                    <ResultCard
                      label="Est. Konversi"
                      value={results.estimatedConversions.toFixed(1)}
                      sub={`Klik x CR ${(inputs.estimatedCr * 100).toFixed(1)}%`}
                    />
                    <ResultCard
                      label="Est. Revenue"
                      value={formatRp(results.estimatedRevenue)}
                      sub="Konversi x harga jual"
                    />
                    <ResultCard
                      label="Simulasi ROAS"
                      value={`${results.simulatedRoas.toFixed(2)}x`}
                      sub="Revenue / Rp 1jt"
                    />
                    <div className="col-span-2">
                      <ResultCard
                        label="Est. Profit Bersih"
                        value={formatRp(results.estimatedProfit)}
                        sub="Setelah semua biaya + iklan Rp 1jt"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Cost breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Rincian Biaya / Unit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {(
                      [
                        ['Harga Jual', inputs.sellingPrice],
                        ['HPP', -inputs.hpp],
                        ['Packaging', -inputs.packagingCost],
                        ['Komisi/Admin', -(inputs.sellingPrice * inputs.commissionRate)],
                        ['Service Fee', -(inputs.sellingPrice * inputs.adminFeeRate)],
                        ['Transaction Fee', -(inputs.sellingPrice * inputs.serviceFeeRate)],
                        ['Processing Fee', -inputs.processingFee],
                        ['Ongkir', -inputs.estimatedShipping],
                        ['Voucher Seller', -inputs.sellerVoucher],
                      ] as [string, number][]
                    )
                      .filter(([, v]) => v !== 0)
                      .map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-muted-foreground">
                            {value < 0 ? `− ${label}` : label}
                          </span>
                          <span className={value < 0 ? 'text-red-600' : 'font-medium'}>
                            {value < 0 ? formatRp(-value) : formatRp(value)}
                          </span>
                        </div>
                      ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Profit Sebelum Iklan</span>
                      <span className={results.profitBeforeAds >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatRp(results.profitBeforeAds)}
                      </span>
                    </div>
                    {results.maxAdSpendAtTarget > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {`− Maks. Ad Spend (ROAS ${inputs.targetRoas.toFixed(1)}x)`}
                        </span>
                        <span className="text-red-600">
                          {formatRp(results.maxAdSpendAtTarget)}
                        </span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Est. Profit Bersih / Unit</span>
                      <span className={results.profitAtTargetRoas >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatRp(results.profitAtTargetRoas)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {`Margin: ${
                        inputs.sellingPrice > 0
                          ? `${((results.profitAtTargetRoas / inputs.sellingPrice) * 100).toFixed(1)}%`
                          : 'N/A'
                      }`}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Saved scenarios                                                      */}
      {/* ------------------------------------------------------------------ */}
      {savedScenarios.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Skenario Tersimpan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedScenarios.map((s) => (
              <Card key={s.id} className="hover:border-orange-300 transition-colors">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.scenario_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.marketplace}</p>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Harga Jual</span>
                        <span className="font-medium">{formatRp(s.selling_price)}</span>
                        <span className="text-muted-foreground">HPP</span>
                        <span>{formatRp(s.hpp)}</span>
                        <span className="text-muted-foreground">Target ROAS</span>
                        <span>{s.target_roas.toFixed(1)}x</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => handleLoadScenario(s)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(s.id)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
