'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle, Lock, ArrowRight, Loader2 } from 'lucide-react'

const features = [
  'Analisis profit unlimited dari laporan Shopee',
  'Analisis iklan: SCALE / OPTIMIZE / KILL',
  'Kalkulator ROAS dengan simulasi budget',
  'Master produk & HPP tracker',
  'Data aman, tidak dibagikan ke siapapun',
  'Update fitur gratis selamanya',
]

export default function UpgradeGate() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleBuy() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payment/create', { method: 'POST' })
      const data = await res.json() as { redirectUrl?: string; alreadyPaid?: boolean; error?: string }

      if (data.alreadyPaid) {
        // Refresh the page — layout will re-check is_paid and show dashboard
        window.location.reload()
        return
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }
      setError(data.error ?? 'Terjadi kesalahan. Coba lagi.')
    } catch {
      setError('Gagal terhubung ke server. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[80vh] gap-6 text-center">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
        <Lock className="h-8 w-8 text-orange-600" />
      </div>

      {/* Headline */}
      <div>
        <h1 className="text-2xl font-bold">Akses Penuh Profit Tebel</h1>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Kamu sudah login! Satu langkah lagi — bayar sekali dan dapatkan akses selamanya ke semua fitur.
        </p>
      </div>

      {/* Pricing card */}
      <div className="rounded-2xl border-2 border-orange-500 bg-card p-6 max-w-sm w-full text-left shadow-lg">
        <div className="text-center mb-4">
          <span className="text-3xl font-extrabold">Rp 99.000</span>
          <p className="text-muted-foreground text-sm mt-1">Bayar sekali, akses selamanya</p>
        </div>

        <ul className="space-y-2 mb-6">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-sm text-red-600 mb-3 text-center">{error}</p>
        )}

        <Button
          size="lg"
          className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleBuy}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              Beli Sekarang — Rp 99.000
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {/* Already paid? */}
      <p className="text-xs text-muted-foreground">
        Sudah bayar tapi belum bisa akses?{' '}
        <Link href="/login" className="underline hover:text-foreground">
          Coba login ulang
        </Link>{' '}
        atau hubungi support.
      </p>
    </div>
  )
}
