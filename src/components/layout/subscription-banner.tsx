'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, X, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SubscriptionStatus } from '@/types'

interface SubscriptionBannerProps {
  subscription: SubscriptionStatus
}

export function SubscriptionBanner({ subscription }: SubscriptionBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  // Hanya tampil untuk plan monthly yang mendekati expiry atau sudah expired
  if (subscription.plan !== 'monthly') return null
  if (subscription.daysRemaining === null) return null
  // Tampil mulai D-7 saja
  if (subscription.daysRemaining > 7) return null
  if (dismissed) return null

  const days = subscription.daysRemaining

  // Tentukan level urgensi
  const isExpired = days < 0
  const isCritical = days <= 1   // D-0 dan D-1
  const isWarning = days <= 3    // D-2 dan D-3
  // days 4-7 = yellow

  async function handleRenew() {
    try {
      const res = await fetch('/api/payment/subscribe', { method: 'POST' })
      const data = await res.json() as { redirectUrl?: string; alreadyActive?: boolean; isLifetime?: boolean; error?: string }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      } else if (data.alreadyActive) {
        router.refresh()
      }
    } catch {
      // ignore
    }
  }

  const bannerClass = cn(
    'relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium',
    isExpired || isCritical
      ? 'bg-destructive text-destructive-foreground'
      : isWarning
      ? 'bg-orange-500 text-white'
      : 'bg-amber-400 text-amber-950'
  )

  const label = isExpired
    ? 'Langganan Pro sudah berakhir — fitur Inventori, Pembelian & Produksi dinonaktifkan.'
    : days === 0
    ? 'Langganan Pro berakhir HARI INI! Perpanjang sekarang agar fitur tidak mati.'
    : days === 1
    ? 'Langganan Pro berakhir BESOK! Perpanjang sekarang.'
    : `Langganan Pro berakhir dalam ${days} hari (${formatExpiry(subscription.expiresAt)}). Perpanjang sekarang.`

  return (
    <div className={bannerClass}>
      {isCritical || isExpired
        ? <AlertTriangle className="h-4 w-4 shrink-0" />
        : <Clock className="h-4 w-4 shrink-0" />
      }
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <Button
        size="sm"
        variant="secondary"
        className={cn(
          'shrink-0 h-7 text-xs gap-1.5',
          (isExpired || isCritical) && 'bg-white text-destructive hover:bg-white/90',
          isWarning && 'bg-white text-orange-600 hover:bg-white/90',
          !isCritical && !isWarning && !isExpired && 'bg-amber-950 text-amber-50 hover:bg-amber-900'
        )}
        onClick={handleRenew}
      >
        <CreditCard className="h-3.5 w-3.5" />
        Perpanjang Rp 49.000
      </Button>
      {!isExpired && (
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
          aria-label="Tutup notifikasi"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const d = new Date(expiresAt)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}
