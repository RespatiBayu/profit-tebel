'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

interface Props {
  storeId: string | null
}

interface Result {
  migratedMasters: number
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
    try {
      const res = await fetch('/api/recalculate-hpp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
      } else {
        setResult(json as Result)
      }
    } catch (err) {
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

      {result && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 text-xs space-y-1">
            <p className="font-medium">HPP berhasil dihitung ulang:</p>
            <ul className="list-disc list-inside space-y-0.5">
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
              <p className="text-amber-700 italic mt-1">{result.warnings.join(' · ')}</p>
            )}
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-green-700 underline"
              onClick={() => window.location.reload()}
            >
              Refresh halaman untuk lihat hasil
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
