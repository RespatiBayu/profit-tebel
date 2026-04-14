'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart3, Mail, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <BarChart3 className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl">Profit Tebel</span>
          </Link>
          <h1 className="text-2xl font-bold">Masuk ke akun kamu</h1>
          <p className="text-muted-foreground mt-1">
            Belum punya akun? Daftar gratis dengan email di bawah.
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border shadow-sm p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="font-semibold text-lg mb-2">Cek email kamu!</h2>
              <p className="text-muted-foreground text-sm">
                Kami kirim link masuk ke <strong>{email}</strong>. Klik link di email
                untuk lanjut ke dashboard.
              </p>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => { setSent(false); setEmail('') }}
              >
                Ganti email
              </Button>
            </div>
          ) : (
            <>
              {/* Google OAuth */}
              <Button
                variant="outline"
                className="w-full gap-2 mb-6"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c2.205 0 4.218.82 5.764 2.166L12 12V4zm-1 0v8H4.236A8 8 0 0 1 11 4zm-6.764 9H11v7.764A8.001 8.001 0 0 1 4.236 13zm7.764 0h6.764A8.001 8.001 0 0 1 12 20.764V13z"/></svg>
                )}
                Lanjut dengan Google
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">atau pakai email</span>
                <div className="flex-1 border-t" />
              </div>

              {/* Magic Link Form */}
              <form onSubmit={handleMagicLink} className="space-y-4">
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
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Kirim Link Masuk
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center mt-6">
                Dengan masuk, kamu setuju dengan{' '}
                <span className="underline cursor-pointer">Syarat & Ketentuan</span>{' '}
                kami.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
