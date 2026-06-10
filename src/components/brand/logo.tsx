import { cn } from '@/lib/utils'

/**
 * Logo Profit Tebel — dipakai konsisten di seluruh app.
 * - LogoMark: ikon (kotak oranye + bar chart naik + panah).
 * - Logo: lockup penuh (mark + wordmark "Profit" navy / "Tebel" oranye).
 *
 * Warna oranye mengikuti token --primary (sudah diset ke oranye brand #F26522),
 * navy mengikuti --brand-navy.
 */

export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Profit Tebel"
    >
      <rect width="48" height="48" rx="11" fill="hsl(var(--primary))" />
      {/* Bars (naik) */}
      <rect x="12.5" y="27" width="5.5" height="8.5" rx="1.4" fill="#fff" />
      <rect x="21.25" y="22" width="5.5" height="13.5" rx="1.4" fill="#fff" />
      <rect x="30" y="16.5" width="5.5" height="19" rx="1.4" fill="#fff" />
      {/* Garis tren naik */}
      <path
        d="M11 26.5 C 18 24.5, 25 20, 34.5 11.5"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Kepala panah */}
      <path
        d="M29.5 11.5 L34.8 11.5 L34.8 16.8"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function Logo({
  className,
  size = 32,
  showWordmark = true,
  subtitle,
}: {
  className?: string
  size?: number
  showWordmark?: boolean
  /** Tambah baris kecil di bawah wordmark, mis. "MARKETPLACE" atau "Seller analytics". */
  subtitle?: string
}) {
  const wordSize = Math.round(size * 0.56)
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <div className="leading-none">
          <span
            className="font-heading font-bold tracking-tight"
            style={{ fontSize: wordSize }}
          >
            <span className="text-[hsl(var(--brand-navy))]">Profit</span>
            <span className="text-primary">Tebel</span>
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
