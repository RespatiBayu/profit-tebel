'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-red-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Terjadi kesalahan</h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          {error.message || 'Gagal memuat halaman ini. Coba refresh atau hubungi support.'}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Coba Lagi
      </Button>
    </div>
  )
}
