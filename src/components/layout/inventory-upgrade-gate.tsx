'use client'

import Link from 'next/link'
import { Boxes, ClipboardList, ShoppingCart, Sparkles, CheckCircle2, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PRICING, formatRp, hematPct, proUpgradeCost } from '@/lib/pricing'

const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'Pembelian (Purchase Order)',
    desc: 'Catat pembelian bahan baku, lacak penerimaan barang, dan update harga otomatis.',
  },
  {
    icon: Boxes,
    title: 'Manajemen Inventori',
    desc: 'Pantau stok bahan mentah, setengah jadi, dan barang jadi secara real-time.',
  },
  {
    icon: ClipboardList,
    title: 'Formula (Resep Produksi)',
    desc: 'Definisikan resep produk multi-level — HPP dihitung otomatis dari biaya bahan.',
  },
  {
    icon: Sparkles,
    title: 'HPP Otomatis',
    desc: 'HPP di Mapping Produk ter-update otomatis berdasarkan Formula dan harga beli terakhir.',
  },
]

export function InventoryUpgradeGate({ isPaidBasic = false }: { isPaidBasic?: boolean }) {
  const upgradeCost = proUpgradeCost(true)
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Crown className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-heading">Upgrade ke Paket Pro</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Kamu saat ini menggunakan paket <strong>Basic</strong>. Aktifkan paket <strong>Pro</strong> untuk
            mengakses fitur Inventori, Pembelian, dan Produksi dengan HPP otomatis.
          </p>
        </div>

        {/* Feature list */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Yang kamu dapatkan
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{f.title}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Pricing + CTA */}
        <div className="text-center space-y-3">
          {isPaidBasic ? (
            <>
              <div>
                <span className="text-4xl font-bold">{formatRp(upgradeCost)}</span>
                <span className="text-muted-foreground text-sm"> upgrade dari Basic</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Kamu sudah punya Basic — cukup bayar <strong>selisihnya</strong> ({formatRp(PRICING.pro.launch)} − {formatRp(PRICING.basic.launch)}).
                Masa aktif Pro melanjutkan periode Basic kamu, tidak reset 365 hari.
              </p>
            </>
          ) : (
            <>
              <div>
                <span className="text-4xl font-bold">{formatRp(PRICING.pro.launch)}</span>
                <span className="text-muted-foreground text-sm"> / tahun</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground line-through">{formatRp(PRICING.pro.normal)}</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Hemat {hematPct('pro')}% (harga launching)</span>
              </div>
              <p className="text-xs text-muted-foreground">Aktif 365 hari · Perpanjangan manual, tanpa auto-charge</p>
            </>
          )}
          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Tanpa auto-charge</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> QRIS, VA & e-wallet via iPaymu</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Akses langsung setelah bayar</span>
          </div>
          <Link href="/pricing" className="block">
            <Button size="lg" className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white">
              <Crown className="h-4 w-4" />
              {isPaidBasic ? `Upgrade ke Pro — ${formatRp(upgradeCost)}` : `Aktifkan Paket Pro — ${formatRp(PRICING.pro.launch)}`}
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            Bandingkan paket Basic vs Pro di{' '}
            <Link href="/pricing" className="underline hover:text-foreground transition-colors">halaman harga</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
