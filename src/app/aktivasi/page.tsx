'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Eye, EyeOff, Loader2, CheckCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function AktivasiForm() {
  const router = useRouter()
  const params = useSearchParams()
  const emailFromParam = params.get('email') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password minimal 8 karakter')
      return
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailFromParam, password }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Terjadi kesalahan')
        return
      }
      setSuccess(true)
      // Redirect ke login setelah 2 detik
      setTimeout(() => router.push('/login'), 2000)
    } catch {
      setError('Gagal menghubungi server. Cek koneksi internet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.95)]">
              <BarChart3 className="h-6 w-6" />
            </span>
            <span className="font-heading text-xl font-semibold">Profit Tebel</span>
          </Link>
        </div>

        {/* Card */}
        <div className="brand-panel overflow-hidden rounded-[30px]">
          <div className="p-8 space-y-5">

            {/* Header */}
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <KeyRound className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h1 className="text-xl font-bold">Buat Password Baru</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Akun kamu sudah terdaftar dengan email<br />
                <strong className="text-foreground">{emailFromParam}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Buat password untuk mulai menggunakan Profit Tebel.
              </p>
            </div>

            {success ? (
              <div className="text-center space-y-3 py-4">
                <div className="flex justify-center">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <p className="font-semibold text-green-600">Password berhasil dibuat!</p>
                <p className="text-sm text-muted-foreground">
                  Mengarahkan ke halaman login...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password Baru <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimal 8 karakter"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                      autoComplete="new-password"
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
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-destructive">Minimal 8 karakter ({password.length}/8)</p>
                  )}
                </div>

                {/* Konfirmasi Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Konfirmasi Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Ulangi password di atas"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-xs text-destructive">Password tidak cocok</p>
                  )}
                </div>

                {error && (
                  <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {loading ? 'Menyimpan...' : 'Simpan Password & Masuk'}
                </Button>
              </form>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Sudah punya password?{' '}
              <Link href="/login" className="underline hover:text-foreground transition-colors">
                Kembali ke login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AktivasiPage() {
  return (
    <Suspense>
      <AktivasiForm />
    </Suspense>
  )
}
