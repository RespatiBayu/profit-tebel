'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, X, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SubscriptionStatus } from '@/types'

interface SubscriptionBannerProps {
  subscription: SubscriptionStatus
}

const TIER_LABEL: Record<string, string> = { basic: 'Basic', pro: 'Pro' }

export function SubscriptionBanner({ subscription }: SubscriptionBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const tierLabel = subscription.tier ? (TIER_LABEL[subscription.tier] ?? 'Basic') : 'Basic'

  // 1) READ-ONLY (akses habis) — banner merah persisten, tidak bisa ditutup.
  if (subscription.isReadOnly) {
    return (
      <Banner tone="danger" icon={AlertTriangle} dismissible={false}>
        <span className="flex-1 min-w-0">
          Masa akses kamu sudah habis — analitik jadi <strong>read-only</strong> dan upload data baru diblokir.
        </span>
        <CtaButton tone="danger" label="Perpanjang" />
      </Banner>
    )
  }

  // 2) TRIAL — ingatkan mulai H-7.
  if (subscription.isTrial) {
    const d = subscription.trialDaysRemaining
    if (d === null || d > 7 || dismissed) return null
    const tone = d <= 1 ? 'danger' : d <= 3 ? 'warn' : 'soft'
    const msg =
      d <= 0 ? 'Masa coba Basic berakhir hari ini.'
      : d === 1 ? 'Masa coba Basic berakhir besok.'
      : `Masa coba Basic tinggal ${d} hari lagi.`
    return (
      <Banner tone={tone} icon={Sparkles} onDismiss={() => setDismissed(true)}>
        <span className="flex-1 min-w-0 truncate">{msg} Beli sekarang biar akses lanjut tanpa putus.</span>
        <CtaButton tone={tone} label="Lihat Paket" />
      </Banner>
    )
  }

  // 3) PAID (basic/pro) mendekati expiry — reminder H-30, H-7, H-1.
  if (subscription.expiresAt && subscription.daysRemaining !== null) {
    const d = subscription.daysRemaining
    if (d > 30 || dismissed) return null
    const tone = d <= 1 ? 'danger' : d <= 7 ? 'warn' : 'soft'
    const msg =
      d <= 0 ? `Lisensi ${tierLabel} berakhir hari ini.`
      : d === 1 ? `Lisensi ${tierLabel} berakhir besok.`
      : `Lisensi ${tierLabel} berakhir dalam ${d} hari (${formatExpiry(subscription.expiresAt)}).`
    return (
      <Banner tone={tone} icon={d <= 7 ? AlertTriangle : Clock} onDismiss={() => setDismissed(true)}>
        <span className="flex-1 min-w-0 truncate">{msg} Perpanjang biar nggak putus.</span>
        <CtaButton tone={tone} label="Perpanjang" />
      </Banner>
    )
  }

  return null
}

type Tone = 'danger' | 'warn' | 'soft'

function Banner({
  tone, icon: Icon, children, dismissible = true, onDismiss,
}: {
  tone: Tone
  icon: React.ElementType
  children: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
}) {
  return (
    <div className={cn(
      'relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium',
      tone === 'danger' ? 'bg-destructive text-destructive-foreground'
      : tone === 'warn' ? 'bg-orange-500 text-white'
      : 'bg-amber-400 text-amber-950'
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      {children}
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
          aria-label="Tutup notifikasi"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function CtaButton({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Link href="/pricing" className="shrink-0">
      <Button
        size="sm"
        variant="secondary"
        className={cn(
          'h-7 text-xs gap-1.5',
          tone === 'danger' && 'bg-white text-destructive hover:bg-white/90',
          tone === 'warn' && 'bg-white text-orange-600 hover:bg-white/90',
          tone === 'soft' && 'bg-amber-950 text-amber-50 hover:bg-amber-900',
        )}
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Link>
  )
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return ''
  return new Date(expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}
