import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

/**
 * Kerangka halaman legal (Syarat & Ketentuan, Refund Policy, FAQ).
 * Nav + footer konsisten dengan landing page, konten di tengah dengan lebar baca nyaman.
 */
export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-[hsl(var(--brand-line)/0.75)] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo size={36} subtitle="Analytics untuk seller" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Beranda
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Terakhir diperbarui: {lastUpdated}</p>
        <div className="legal-content mt-8 space-y-6 text-[15px] leading-7 text-foreground/90">
          {children}
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <Logo size={32} />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link href="/syarat-ketentuan" className="hover:text-foreground">Syarat &amp; Ketentuan</Link>
            <Link href="/kebijakan-refund" className="hover:text-foreground">Kebijakan Refund</Link>
            <Link href="/faq" className="hover:text-foreground">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Heading seksi di dalam halaman legal. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}
