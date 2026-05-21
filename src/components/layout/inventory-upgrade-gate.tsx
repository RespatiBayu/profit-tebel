'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Boxes, ClipboardList, ShoppingCart, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

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
    title: 'Bill of Materials (BOM)',
    desc: 'Definisikan resep produk multi-level — HPP dihitung otomatis dari biaya bahan.',
  },
  {
    icon: Sparkles,
    title: 'HPP Otomatis',
    desc: 'HPP di Master Produk ter-update otomatis berdasarkan BOM dan harga beli terakhir.',
  },
]

export function InventoryUpgradeGate() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubscribe() {
    setLoading(true)
    try {
      const res = await fetch('/api/payment/subscribe', { method: 'POST' })
      const data = await res.json() as {
        redirectUrl?: string
        alreadyActive?: boolean
        isLifetime?: boolean
        error?: string
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      } else if (data.alreadyActive || data.isLifetime) {
        router.refresh()
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-heading">Fitur Pro</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Inventori, Pembelian, dan Produksi hanya tersedia untuk pengguna berlangganan.
            Kelola stok bahan baku hingga HPP otomatis dari BOM.
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
          <div>
            <span className="text-3xl font-bold">Rp 49.000</span>
            <span className="text-muted-foreground text-sm"> / bulan</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Batalkan kapan saja
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Pembayaran via Midtrans
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Aktif 30 hari
            </span>
          </div>
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleSubscribe}
            disabled={loading}
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Memproses...' : 'Langganan Sekarang'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Sudah berlangganan tapi fitur tidak aktif?{' '}
            <button
              className="underline hover:text-foreground transition-colors"
              onClick={() => router.refresh()}
            >
              Refresh halaman
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
