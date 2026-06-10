'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

const KEY = 'pt_launch_deadline'
const WINDOW_MS = 24 * 60 * 60 * 1000

// Countdown harga launching 24 jam, dihitung dari pertama kali user buka halaman
// (disimpan di sessionStorage agar reset tiap sesi baru).
export function LaunchCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    let deadline = Number(sessionStorage.getItem(KEY))
    if (!deadline || Number.isNaN(deadline)) {
      deadline = Date.now() + WINDOW_MS
      sessionStorage.setItem(KEY, String(deadline))
    }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (remaining === null) return null

  const totalSec = Math.floor(remaining / 1000)
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  const ended = remaining <= 0

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
      <Clock className="h-4 w-4" />
      {ended ? (
        <span>Harga launching berakhir</span>
      ) : (
        <span>
          Harga launching berakhir dalam{' '}
          <span className="font-mono font-bold tabular-nums">{hh}:{mm}:{ss}</span>
        </span>
      )}
    </div>
  )
}
