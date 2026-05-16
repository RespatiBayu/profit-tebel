'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart3, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setAnalyticsTags({
      auth_state: 'guest',
      auth_surface: 'login_page',
    })
  }, [])

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
        setError('Email atau password salah. Coba lagi.')
      } else if (error.message.includes('Email not confirmed')) {
        reason = 'email_not_confirmed'
        setError('Email belum diverifikasi. Cek inbox kamu.')
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
        {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.email?.split('@')[0] ?? null,
          is_paid: false,
        },
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

        <div className="w-full max-w-md lg:max-w-none lg:justify-self-end">
          <div className="mb-6 text-center lg:hidden">
            <BrandBadge />
          </div>

          <div className="mb-6 text-center">
            <Link href="/" className="mb-3 inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.95)]">
                <BarChart3 className="h-6 w-6" />
              </span>
              <span className="font-heading text-xl font-semibold">Profit Tebel</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Masuk untuk buka dashboard profit, iklan, dan ROAS kamu.
            </p>
          </div>

          <div className="brand-panel overflow-hidden rounded-[30px]">
            <div className="p-8">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="kamu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1"
                    autoComplete="email"
                  />
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
                      if (!email) {
                        setError('Masukkan email dulu.')
                        return
                      }
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
