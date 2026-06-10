'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setAnalyticsTags, trackEvent } from '@/lib/analytics'

function BrandBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
      <span className="h-2 w-2 rounded-full bg-primary" />
      Seller analytics yang lebih rapi
    </div>
  )
}

type Step = 'email' | 'password'

export default function LoginPage() {
  const [step, setStep]               = useState<Step>('email')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    setAnalyticsTags({ auth_state: 'guest', auth_surface: 'login_page' })
  }, [])

  // Step 1: cek apakah email terdaftar
  async function handleCheckEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res  = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json() as { exists?: boolean; hasSetPassword?: boolean; error?: string }

      if (!data.exists) {
        setError('Email tidak terdaftar. Hubungi admin untuk mendaftar.')
        setLoading(false)
        return
      }

      if (!data.hasSetPassword) {
        // Belum set password → arahkan ke halaman aktivasi
        router.push(`/aktivasi?email=${encodeURIComponent(email.trim())}`)
        return
      }

      // Sudah punya password → lanjut ke step 2
      setStep('password')
      setError(null)
    } catch {
      setError('Gagal menghubungi server. Cek koneksi internet.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: login dengan password
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    trackEvent('auth_login_attempt', { method: 'password' })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      let reason = 'unknown'
      if (error.message.includes('Invalid login credentials')) {
        reason = 'invalid_credentials'
        setError('Password salah. Coba lagi.')
      } else if (error.message.includes('Email not confirmed')) {
        reason = 'email_not_confirmed'
        setError('Email belum diverifikasi. Hubungi admin.')
      } else {
        reason = 'unexpected_error'
        setError(error.message)
      }
      trackEvent('auth_login_failed', { method: 'password', reason })
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert(
        { id: data.user.id, email: data.user.email, full_name: data.user.email?.split('@')[0] ?? null, is_paid: false },
        { onConflict: 'id', ignoreDuplicates: true }
      )
    }

    trackEvent('auth_login_success', { method: 'password' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl gap-8 lg:grid-cols-[1fr_430px] lg:items-center">

        {/* Left side */}
        <div className="hidden lg:block">
          <BrandBadge />
          <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-tight tracking-tight text-foreground">
            Masuk dan lanjutkan analisis toko kamu dalam nuansa yang lebih clean.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">
            Semua data profit, iklan, dan ROAS kamu tetap di satu tempat yang hangat,
            rapi, dan fokus ke angka yang penting.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              'Upload laporan marketplace tanpa ribet.',
              'Pantau profit bersih per produk lebih cepat.',
              'Cek kampanye iklan yang perlu di-scale.',
              'Hitung target ROAS dengan tampilan yang nyaman.',
            ].map((item) => (
              <div key={item} className="brand-panel-soft rounded-[24px] p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <p className="text-sm leading-6 text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right side — form */}
        <div className="w-full max-w-md lg:max-w-none lg:justify-self-end">
          <div className="mb-6 text-center lg:hidden">
            <BrandBadge />
          </div>

          <div className="mb-6 text-center">
            <Link href="/" className="mb-3 inline-flex">
              <Logo size={40} />
            </Link>
            <p className="text-sm text-muted-foreground">
              Masuk untuk buka dashboard profit, iklan, dan ROAS kamu.
            </p>
          </div>

          <div className="brand-panel overflow-hidden rounded-[30px]">
            <div className="p-8">

              {/* Step 1 — Email */}
              {step === 'email' && (
                <form onSubmit={handleCheckEmail} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="kamu@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null) }}
                      required
                      className="mt-1"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lanjut'}
                  </Button>
                </form>
              )}

              {/* Step 2 — Password */}
              {step === 'password' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Email display (readonly) */}
                  <div>
                    <Label>Email</Label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                      <span className="flex-1 text-sm truncate text-foreground">{email}</span>
                      <button
                        type="button"
                        onClick={() => { setStep('email'); setPassword(''); setError(null) }}
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Ganti
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-10"
                        autoComplete="current-password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="-mt-1 text-right">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={async () => {
                        setLoading(true)
                        trackEvent('auth_password_reset_requested')
                        await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
                        })
                        setError(null)
                        setLoading(false)
                        alert(`Link reset password dikirim ke ${email}`)
                      }}
                    >
                      Lupa password?
                    </button>
                  </div>

                  {error && (
                    <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Masuk'}
                  </Button>
                </form>
              )}

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Dengan masuk, kamu setuju dengan{' '}
                <span className="cursor-pointer underline">Syarat &amp; Ketentuan</span>{' '}
                kami.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
