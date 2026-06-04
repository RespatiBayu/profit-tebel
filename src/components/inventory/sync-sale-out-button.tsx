'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface SyncSaleOutButtonProps {
  storeId?: string | null
  onSynced?: () => void
}

export function SyncSaleOutButton({ storeId, onSynced }: SyncSaleOutButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory/stock/sync-sale-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: storeId ?? null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal sync')

      const { ordersProcessed, transactionsCreated, skippedNoLink } = json.data
      if (transactionsCreated === 0) {
        toast.info('Tidak ada transaksi baru — semua order sudah tersinkron.')
      } else {
        toast.success(
          `${transactionsCreated} transaksi sale_out dicatat dari ${ordersProcessed} order Selesai.` +
          (skippedNoLink > 0 ? ` (${skippedNoLink} SKU belum ter-link ke item)` : '')
        )
      }
      onSynced?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={loading}
      className="h-9 gap-1.5"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Sinkronisasi...' : 'Sync Penjualan'}
    </Button>
  )
}
