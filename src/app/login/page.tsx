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

type Tab = 'login' | 'register'

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function BrandBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
      <span className="h-2 w-2 rounded-full bg-primary" />
      Seller analytics yang lebih rapi
    </div>
  )
}

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setAnalyticsTags({
      auth_state: 'guest',
      auth_surface: 'login_page',
    })
  }, [])

  function resetForm() {
    setError(null)
    setPassword('')
    setConfirmPassword('')
    setRegistered(false)
  }

  function switchTab(t: Tab) {
    setTab(t)
    resetForm()
    trackEvent('auth_tab_switched', { tab: t })
  }

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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Password tidak cocok.')
      return
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }

    setLoading(true)
    setError(null)
    trackEvent('auth_register_attempt', { method: 'password' })

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Email ini sudah terdaftar. Silakan login.')
        trackEvent('auth_register_failed', { method: 'password', reason: 'already_registered' })
      } else {
        setError(error.message)
        trackEvent('auth_register_failed', { method: 'password', reason: 'unexpected_error' })
      }
      setLoading(false)
      return
    }

    trackEvent('auth_register_success', { method: 'password' })
    setRegistered(true)
    setLoading(false)
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    trackEvent('auth_login_attempt', { method: 'google_oauth' })

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      trackEvent('auth_login_failed', { method: 'google_oauth', reason: 'oauth_start_failed' })
      setGoogleLoading(false)
    }
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
            <div className="flex border-b border-[hsl(var(--brand-line)/0.7)] bg-white/70">
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-4 text-sm font-medium transition-colors ${
                    tab === t
                      ? 'border-b-2 border-primary -mb-px text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'login' ? 'Masuk' : 'Daftar'}
                </button>
              ))}
            </div>

            <div className="p-8">
              {registered ? (
                <div className="py-4 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold">Cek email kamu!</h2>
                  <p className="text-sm text-muted-foreground">
                    Kami kirim link verifikasi ke <strong>{email}</strong>.
                    Klik link di email untuk mengaktifkan akun.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setRegistered(false)
                      switchTab('login')
                    }}
                  >
                    Sudah verifikasi? Masuk di sini
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="mb-6 w-full gap-2"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                  >
                    {googleLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GoogleIcon />
                    )}
                    Lanjut dengan Google
                  </Button>

                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex-1 border-t border-[hsl(var(--brand-line)/0.7)]" />
                    <span className="text-xs text-muted-foreground">atau pakai email</span>
                    <div className="flex-1 border-t border-[hsl(var(--brand-line)/0.7)]" />
                  </div>

                  <form
                    onSubmit={tab === 'login' ? handleLogin : handleRegister}
                    className="space-y-4"
                  >
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
                          placeholder={tab === 'register' ? 'Min. 8 karakter' : '••••••••'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="pr-10"
                          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
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

                    {tab === 'register' && (
                      <div>
                        <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                        <Input
                          id="confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Ulangi password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          className="mt-1"
                          autoComplete="new-password"
                        />
                      </div>
                    )}

                    {tab === 'login' && (
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
                    )}

                    {error && (
                      <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : tab === 'login' ? (
                        'Masuk'
                      ) : (
                        'Buat Akun'
                      )}
                    </Button>
                  </form>

                  <p className="mt-6 text-center text-xs text-muted-foreground">
                    Dengan masuk, kamu setuju dengan{' '}
                    <span className="cursor-pointer underline">Syarat &amp; Ketentuan</span>{' '}
                    kami.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
