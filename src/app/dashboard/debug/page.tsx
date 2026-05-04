'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DebugPage() {
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const form = e.currentTarget
    const fileInput = form.elements.namedItem('file') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/debug/inspect-xlsx', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        setResult(json)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Debug: Inspeksi File XLSX</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload file income XLSX untuk lihat struktur sheet-nya. File TIDAK disimpan ke database.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload file untuk diperiksa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <input type="file" name="file" accept=".xlsx,.xls" className="block" required />
            <Button type="submit" disabled={loading}>
              {loading ? 'Memproses...' : 'Inspeksi File'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-700 font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {result != null && (
        <Card>
          <CardHeader>
            <CardTitle>Hasil Inspeksi (copy-paste ke chat)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-50 border rounded p-4 overflow-auto max-h-[600px] whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(result, null, 2))
              }}
            >
              Copy ke Clipboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
