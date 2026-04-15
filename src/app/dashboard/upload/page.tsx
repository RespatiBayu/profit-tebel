'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { MARKETPLACE_OPTIONS } from '@/lib/constants/marketplace-fees'

type UploadType = 'income' | 'ads'
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface UploadState {
  file: File | null
  status: UploadStatus
  progress: number
  result: {
    recordCount?: number
    insertedCount?: number
    duplicateCount?: number
    newProducts?: number
    periodStart?: string | null
    periodEnd?: string | null
    error?: string
  } | null
}

function formatDate(d: string | null | undefined) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DropZone({
  type,
  accept,
  state,
  onChange,
  onRemove,
}: {
  type: UploadType
  accept: string
  state: UploadState
  onChange: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const isIncome = type === 'income'
  const Icon = isIncome ? FileSpreadsheet : FileText
  const label = isIncome ? 'Data Penghasilan' : 'Data Iklan'
  const desc = isIncome ? 'File .xlsx dari Shopee Income' : 'File .csv dari Shopee Ads'
  const color = isIncome ? 'text-blue-600' : 'text-orange-600'
  const bg = isIncome ? 'bg-blue-50' : 'bg-orange-50'

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onChange(file)
  }

  if (state.file && state.status !== 'idle') {
    return (
      <div className={`rounded-xl border-2 p-5 ${bg} space-y-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={`h-8 w-8 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{state.file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(state.file.size)}</p>
            </div>
          </div>
          {state.status === 'error' ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {state.status === 'uploading' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Memproses file...</span>
            </div>
            <Progress value={state.progress} className="h-2" />
          </div>
        )}

        {state.status === 'success' && state.result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Upload berhasil!</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="text-green-700 font-medium">
                  +{(state.result.insertedCount ?? 0).toLocaleString('id-ID')} data baru
                </span>
              </span>
              {(state.result.duplicateCount ?? 0) > 0 && (
                <span className="text-amber-700">
                  {state.result.duplicateCount?.toLocaleString('id-ID')} duplikat dilewati
                </span>
              )}
              <span className="col-span-2">
                Total di file: {state.result.recordCount?.toLocaleString('id-ID')} baris
              </span>
              {(state.result.newProducts ?? 0) > 0 && (
                <span className="col-span-2 text-green-700">
                  +{state.result.newProducts} produk baru ditambahkan ke master
                </span>
              )}
              {state.result.periodStart && (
                <span className="col-span-2">
                  Periode: {formatDate(state.result.periodStart)} — {formatDate(state.result.periodEnd)}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRemove}>
              Upload ulang
            </Button>
          </div>
        )}

        {state.status === 'error' && state.result?.error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{state.result.error}</AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer p-6 text-center space-y-3
        ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onChange(file)
          e.target.value = ''
        }}
      />
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${bg}`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Badge variant="outline" className="text-xs">{accept.toUpperCase()}</Badge>
        <span className="text-xs text-muted-foreground">Drag & drop atau klik</span>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const [marketplace, setMarketplace] = useState('shopee')
  const [incomeState, setIncomeState] = useState<UploadState>({
    file: null, status: 'idle', progress: 0, result: null,
  })
  const [adsState, setAdsState] = useState<UploadState>({
    file: null, status: 'idle', progress: 0, result: null,
  })

  function setFile(type: UploadType, file: File) {
    if (type === 'income') {
      setIncomeState({ file, status: 'idle', progress: 0, result: null })
    } else {
      setAdsState({ file, status: 'idle', progress: 0, result: null })
    }
  }

  function removeFile(type: UploadType) {
    if (type === 'income') {
      setIncomeState({ file: null, status: 'idle', progress: 0, result: null })
    } else {
      setAdsState({ file: null, status: 'idle', progress: 0, result: null })
    }
  }

  async function uploadFile(type: UploadType) {
    const state = type === 'income' ? incomeState : adsState
    const setState = type === 'income' ? setIncomeState : setAdsState
    if (!state.file) return

    setState((prev) => ({ ...prev, status: 'uploading', progress: 30 }))

    const formData = new FormData()
    formData.append('file', state.file)
    formData.append('marketplace', marketplace)

    const endpoint = `/api/parse/${type}`

    try {
      setState((prev) => ({ ...prev, progress: 60 }))
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          progress: 0,
          result: { error: data.error ?? 'Upload gagal' },
        }))
        return
      }

      setState((prev) => ({
        ...prev,
        status: 'success',
        progress: 100,
        result: {
          recordCount: data.recordCount,
          insertedCount: data.insertedCount,
          duplicateCount: data.duplicateCount,
          newProducts: data.newProducts,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        },
      }))
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'error',
        progress: 0,
        result: { error: 'Koneksi gagal. Cek internet kamu.' },
      }))
    }
  }

  const hasFiles = incomeState.file || adsState.file
  const canUploadIncome = incomeState.file && incomeState.status === 'idle'
  const canUploadAds = adsState.file && adsState.status === 'idle'
  const canUploadAny = canUploadIncome || canUploadAds

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Upload Data</h1>
        <p className="text-muted-foreground mt-1">
          Upload laporan dari Shopee Seller Center untuk mulai analisis.
        </p>
      </div>

      {/* Marketplace selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pilih Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={marketplace} onValueChange={(v) => v && setMarketplace(v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKETPLACE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {marketplace === 'tiktok' && (
            <p className="text-xs text-muted-foreground mt-2">
              TikTok Shop parser segera hadir. Saat ini hanya Shopee yang didukung.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload zones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">File Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <DropZone
              type="income"
              accept=".xlsx"
              state={incomeState}
              onChange={(f) => setFile('income', f)}
              onRemove={() => removeFile('income')}
            />
            <DropZone
              type="ads"
              accept=".csv"
              state={adsState}
              onChange={(f) => setFile('ads', f)}
              onRemove={() => removeFile('ads')}
            />
          </div>

          {hasFiles && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {canUploadIncome && (
                <Button
                  className="gap-2"
                  onClick={() => uploadFile('income')}
                  disabled={incomeState.status === 'uploading'}
                >
                  <Upload className="h-4 w-4" />
                  Proses Data Penghasilan
                </Button>
              )}
              {canUploadAds && (
                <Button
                  variant={canUploadIncome ? 'outline' : 'default'}
                  className="gap-2"
                  onClick={() => uploadFile('ads')}
                  disabled={adsState.status === 'uploading'}
                >
                  <Upload className="h-4 w-4" />
                  Proses Data Iklan
                </Button>
              )}
              {canUploadAny && canUploadIncome && canUploadAds && (
                <Button
                  variant="secondary"
                  className="gap-2 sm:ml-auto"
                  onClick={async () => {
                    await uploadFile('income')
                    await uploadFile('ads')
                  }}
                >
                  Proses Semua
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next steps after success */}
      {(incomeState.status === 'success' || adsState.status === 'success') && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <CheckCircle className="h-5 w-5" />
              Upload selesai! Langkah selanjutnya:
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {incomeState.status === 'success' && (
                <Link href="/dashboard/profit">
                  <Button size="sm" className="gap-2 w-full sm:w-auto">
                    Lihat Analisis Profit
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              {adsState.status === 'success' && (
                <Link href="/dashboard/ads">
                  <Button size="sm" variant={incomeState.status === 'success' ? 'outline' : 'default'} className="gap-2 w-full sm:w-auto">
                    Lihat Analisis Iklan
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Link href="/dashboard/products">
                <Button size="sm" variant="ghost" className="gap-2 w-full sm:w-auto">
                  Isi HPP Produk
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guide */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">Cara download file dari Shopee:</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Data Penghasilan (.xlsx):</span>
              {' '}Seller Center → Keuangan → Penghasilan Saya → Download
            </div>
            <div>
              <span className="font-medium text-foreground">Data Iklan (.csv):</span>
              {' '}Shopee Ads → Laporan → Download Laporan Produk
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
