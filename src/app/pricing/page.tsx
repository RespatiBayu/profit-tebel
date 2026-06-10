import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'Harga & Paket',
  description: 'Pilih paket Basic atau Pro Profit Tebel — lisensi tahunan, tanpa auto-charge.',
}

const ADMIN_EMAIL = 'profittebel.admin@gmail.com'

const BASIC_FEATURES = [
  'Dashboard Profit (Overview & Analisis)',
  'Detail Iklan & Kalkulator ROAS',
  'Mapping Produk',
  'Biaya Operasional',
  'Toko Saya & Upload Data',
  'Master Item (setup HPP)',
]

const PRO_LOCKED_IN_BASIC = [
  'Formula (Resep Produksi)',
  'Pembelian (PO)',
  'Produksi',
  'Laporan Stok',
  'Stock Opname',
]

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function PlanCard({
  name, normal, launch, highlight, children, ctaLabel,
}: {
  name: string
  normal: number
  launch: number
  highlight?: boolean
  children: React.ReactNode
  ctaLabel: string
}) {
  const hematPct = Math.round((1 - launch / normal) * 100)
  return (
    <div className={`relative rounded-2xl border bg-card p-6 shadow-sm ${highlight ? 'border-primary ring-2 ring-primary/30' : ''}`}>
      {highlight && (
        <Badge className="absolute -top-3 left-6 bg-primary text-primary-foreground">Paling Lengkap</Badge>
      )}
      <h3 className="text-lg font-bold">{name}</h3>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-extrabold tracking-tight">{formatRp(launch)}</span>
        <span className="pb-1 text-sm text-muted-foreground">/tahun</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground line-through">{formatRp(normal)}</span>
        <Badge variant="secondary" className="text-green-700">Hemat {hematPct}%</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Harga launching · perpanjangan manual, tanpa auto-charge.</p>

      <div className="mt-5 space-y-2">{children}</div>

      <a
        href={`mailto:${ADMIN_EMAIL}?subject=Aktivasi%20Profit%20Tebel%20${encodeURIComponent(name)}`}
        className="mt-6 block"
      >
        <Button className="w-full" variant={highlight ? 'default' : 'outline'}>
          {ctaLabel}
        </Button>
      </a>
    </div>
  )
}

function FeatureRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok
        ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        : <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
      <span className={ok ? '' : 'text-muted-foreground/70'}>{children}</span>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/"><Logo size={34} /></Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Pilih paket kamu</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Lisensi tahunan. Akses aktif 365 hari sejak pembelian. Tanpa langganan bulanan,
            tanpa auto-charge, tanpa kartu kredit disimpan.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <PlanCard name="Basic" normal={149000} launch={97000} ctaLabel="Pilih Basic">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Termasuk</p>
            {BASIC_FEATURES.map((f) => <FeatureRow key={f} ok>{f}</FeatureRow>)}
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Belum termasuk</p>
            {PRO_LOCKED_IN_BASIC.map((f) => <FeatureRow key={f} ok={false}>{f}</FeatureRow>)}
          </PlanCard>

          <PlanCard name="Pro" normal={297000} launch={197000} highlight ctaLabel="Pilih Pro">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semua fitur Basic, plus</p>
            {PRO_LOCKED_IN_BASIC.map((f) => <FeatureRow key={f} ok>{f}</FeatureRow>)}
            <div className="pt-2">
              <FeatureRow ok>Inventori &amp; Produksi full unlock</FeatureRow>
            </div>
          </PlanCard>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Checkout otomatis &amp; harga launching terbatas segera aktif. Sementara,{' '}
          <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary hover:underline">hubungi admin</a>{' '}
          untuk aktivasi.
        </p>
      </main>
    </div>
  )
}
