'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

interface Props {
  storeId: string | null
}

interface Result {
  migratedMasters: number
  totalMasters: number
  mastersWithHpp: number
  ordersAllUpdated: number
  ordersAllWithHpp: number
  ordersUpdated: number
  ordersWithHpp: number
  ordersNoMapping: number
  warnings: string[]
}

export function RecalculateHppButton({ storeId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    setResult(null)
    trackEvent('hpp_recalculation_started', {
      has_store_selected: Boolean(storeId),
    })
    try {
      const res = await fetch('/api/recalculate-hpp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const json = await res.json()
      if (!res.ok) {
        trackEvent('hpp_recalculation_failed')
        setError(json.error ?? `HTTP ${res.status}`)
      } else {
        trackEvent('hpp_recalculation_completed', {
          migrated_masters: json.migratedMasters,
          updated_orders: json.ordersUpdated,
        })
        setResult(json as Result)
      }
    } catch (err) {
      trackEvent('hpp_recalculation_failed')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Menghitung ulang...' : 'Recalculate HPP'}
      </Button>

      {result && (() => {
        const noMasterHpp = result.totalMasters > 0 && result.mastersWithHpp === 0
        return (
          <Alert className={noMasterHpp ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}>
            {noMasterHpp ? (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-600" />
            )}
            <AlertDescription className={`text-xs space-y-1 ${noMasterHpp ? 'text-amber-900' : 'text-green-800'}`}>
              <p className="font-medium">
                {noMasterHpp ? 'HPP tidak bisa dihitung — master produk kosong:' : 'HPP berhasil dihitung ulang:'}
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li className={noMasterHpp ? 'font-medium text-amber-800' : ''}>
                  {result.mastersWithHpp}/{result.totalMasters} master produk punya HPP terisi
                </li>
                {result.migratedMasters > 0 && (
                  <li>{result.migratedMasters} master produk di-migrasi numeric ID → SKU</li>
                )}
                <li>
                  {result.ordersAllWithHpp}/{result.ordersAllUpdated} order pending dapat HPP &gt; 0
                </li>
                <li>
                  {result.ordersWithHpp}/{result.ordersUpdated} order income (dilepas) dapat HPP &gt; 0
                </li>
                {result.ordersNoMapping > 0 && (
                  <li className="text-amber-700">
                    {result.ordersNoMapping} order income tidak punya mapping SKU (perlu upload Order.all)
                  </li>
                )}
              </ul>
              {result.warnings.length > 0 && (
                <div className="space-y-0.5 mt-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-amber-700 italic">{w}</p>
                  ))}
                </div>
              )}
              {noMasterHpp ? (
                <a
                  href="/dashboard/products"
                  className="inline-block underline font-medium text-amber-800 mt-1"
                >
                  → Buka menu Master Produk untuk isi HPP
                </a>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-green-700 underline"
                  onClick={() => window.location.reload()}
                >
                  Refresh halaman untuk lihat hasil
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )
      })()}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
