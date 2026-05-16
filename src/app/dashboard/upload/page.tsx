'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Store as StoreIcon,
  Plus,
} from 'lucide-react'
import { DashboardLink } from '@/components/layout/dashboard-link'
import { MARKETPLACE_OPTIONS } from '@/lib/constants/marketplace-fees'
import { trackEvent } from '@/lib/analytics'
import { ResetDataDialog } from '@/components/upload/reset-data-dialog'
import { RecalculateHppButton } from '@/components/upload/recalculate-hpp-button'
import type { Store, UploadJobStatusResponse } from '@/types'

type UploadType = 'income' | 'ads' | 'ads_product' | 'orders_all'
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface UploadState {
  file: File | null
  jobId: string | null
  status: UploadStatus
  progress: number
  progressLabel: string | null
  result: {
    recordCount?: number
    insertedCount?: number
    updatedCount?: number
    unchangedCount?: number
    duplicateCount?: number
    newProducts?: number
    periodStart?: string | null
    periodEnd?: string | null
    error?: string
    warnings?: string[]
    storeId?: string | null
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

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension || 'unknown'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function DropZone({
  type,
  accept,
  state,
  onChange,
  onRemove,
  disabled,
  disabledReason,
}: {
  type: UploadType
  accept: string
  state: UploadState
  onChange: (file: File) => void
  onRemove: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const Icon = type === 'income' || type === 'orders_all' ? FileSpreadsheet : FileText
  const label = type === 'income'
    ? 'Data Penghasilan'
    : type === 'ads'
    ? 'Data Iklan (Summary)'
    : type === 'ads_product'
    ? 'Data per Produk (GMV Max Auto)'
    : 'Semua Pesanan (Order.all)'
  const desc = type === 'income'
    ? 'File .xlsx dari Shopee Income (Sudah Dilepas)'
    : type === 'ads'
    ? 'File .csv dari Shopee Ads'
    : type === 'ads_product'
    ? 'File .csv dari Shop GMV Max Detail Produk'
    : 'File .xlsx dari Seller Center → Pesanan Saya → Export'
  const color = type === 'income'
    ? 'text-blue-600'
    : type === 'ads'
    ? 'text-orange-600'
    : type === 'ads_product'
    ? 'text-purple-600'
    : 'text-teal-600'
  const bg = type === 'income'
    ? 'bg-blue-50'
    : type === 'ads'
    ? 'bg-orange-50'
    : type === 'ads_product'
    ? 'bg-purple-50'
    : 'bg-teal-50'

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onChange(file)
  }

  // Show file preview immediately after selection (before upload starts)
  if (state.file && state.status === 'idle') {
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
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove} title="Hapus file">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground italic">Siap diproses — klik tombol upload di bawah.</p>
      </div>
    )
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
              <span>{state.progressLabel ?? 'Memproses file...'}</span>
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
                <span className={`font-medium ${(state.result.insertedCount ?? 0) > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                  +{(state.result.insertedCount ?? 0).toLocaleString('id-ID')} data baru
                </span>
              </span>
              {(state.result.updatedCount ?? 0) > 0 && (
                <span className="text-blue-700 font-medium">
                  ↻ {state.result.updatedCount?.toLocaleString('id-ID')} di-update ke versi terbaru
                </span>
              )}
              {(state.result.unchangedCount ?? state.result.duplicateCount ?? 0) > 0 && (
                <span className="text-amber-700">
                  {(state.result.unchangedCount ?? state.result.duplicateCount)?.toLocaleString('id-ID')} tidak berubah (skip)
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
            {/* Show warnings/errors from server (e.g. DB insert failures) */}
            {(state.result.warnings?.length ?? 0) > 0 && (
              <Alert variant="destructive" className="py-2 mt-1">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-0.5">
                  {state.result.warnings!.map((w, i) => <p key={i}>{w}</p>)}
                </AlertDescription>
              </Alert>
            )}
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

  if (disabled) {
    return (
      <div
        className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center space-y-3 opacity-60 cursor-not-allowed"
        title={disabledReason}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
        {disabledReason && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mx-auto inline-block max-w-full">
            {disabledReason}
          </p>
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
  const searchParams = useSearchParams()
  const urlStoreId = searchParams.get('store') ?? ''
  const [marketplace, setMarketplace] = useState('shopee')
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string>(urlStoreId)
  const [storesLoading, setStoresLoading] = useState(true)
  const [incomeState, setIncomeState] = useState<UploadState>({
    file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null,
  })
  const [adsState, setAdsState] = useState<UploadState>({
    file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null,
  })
  const [adsProductState, setAdsProductState] = useState<UploadState>({
    file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null,
  })
  const [ordersAllState, setOrdersAllState] = useState<UploadState>({
    file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null,
  })
  // Upload prerequisite state — Order.all must exist before Income upload
  const [hasOrdersAllData, setHasOrdersAllData] = useState<boolean>(false)
  const [statusLoading, setStatusLoading] = useState(true)

  // Fetch upload status (whether Order.all has been uploaded for this store)
  const refreshUploadStatus = useCallback(async () => {
    if (!storeId) {
      setHasOrdersAllData(false)
      setStatusLoading(false)
      return
    }
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/upload-status?store=${encodeURIComponent(storeId)}`)
      if (res.ok) {
        const json = await res.json()
        setHasOrdersAllData(!!json.hasOrdersAll)
      }
    } catch {
      // ignore — treat as no data
    } finally {
      setStatusLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    refreshUploadStatus()
  }, [refreshUploadStatus])

  // Load stores on mount
  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => {
        const list: Store[] = data.stores ?? []
        setStores(list)
        // Default store: URL param > first store
        if (!urlStoreId && list.length > 0 && !storeId) {
          setStoreId(list[0].id)
          setMarketplace(list[0].marketplace)
        } else if (urlStoreId) {
          const s = list.find((x) => x.id === urlStoreId)
          if (s) setMarketplace(s.marketplace)
        }
        setStoresLoading(false)
      })
      .catch(() => setStoresLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When store changes, sync marketplace
  useEffect(() => {
    const s = stores.find((x) => x.id === storeId)
    if (s) setMarketplace(s.marketplace)
  }, [storeId, stores])

  function setFile(type: UploadType, file: File) {
    trackEvent('upload_file_selected', {
      upload_type: type,
      file_extension: getFileExtension(file.name),
      file_size_kb: Math.round(file.size / 1024),
    })

    if (type === 'income') setIncomeState({ file, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else if (type === 'ads') setAdsState({ file, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else if (type === 'ads_product') setAdsProductState({ file, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else setOrdersAllState({ file, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
  }

  function removeFile(type: UploadType) {
    if (type === 'income') setIncomeState({ file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else if (type === 'ads') setAdsState({ file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else if (type === 'ads_product') setAdsProductState({ file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
    else setOrdersAllState({ file: null, jobId: null, status: 'idle', progress: 0, progressLabel: null, result: null })
  }

  async function pollUploadJob(type: UploadType, jobId: string) {
    const setState =
      type === 'income'
        ? setIncomeState
        : type === 'ads'
        ? setAdsState
        : type === 'ads_product'
        ? setAdsProductState
        : setOrdersAllState

    while (true) {
      await sleep(1500)

      const res = await fetch(`/api/upload-jobs/${jobId}`, { cache: 'no-store' })
      const data = (await res.json()) as UploadJobStatusResponse & { error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? 'Gagal membaca status upload')
      }

      if (data.status === 'queued' || data.status === 'processing') {
        setState((prev) => ({
          ...prev,
          jobId,
          status: 'uploading',
          progress: Math.max(5, data.progress ?? prev.progress),
          progressLabel: data.progressLabel ?? prev.progressLabel ?? 'Memproses file...',
        }))
        continue
      }

      if (data.status === 'failed') {
        trackEvent('upload_failed', {
          upload_type: type,
          stage: 'processing',
        })

        setState((prev) => ({
          ...prev,
          jobId,
          status: 'error',
          progress: 0,
          progressLabel: null,
          result: { error: data.error ?? 'Upload gagal' },
        }))
        return
      }

      if (data.status === 'completed') {
        trackEvent('upload_completed', {
          upload_type: type,
          record_count: data.result?.recordCount ?? 0,
          inserted_count: data.result?.insertedCount ?? 0,
          updated_count: data.result?.updatedCount ?? 0,
          warnings_count: data.result?.warnings?.length ?? 0,
        })

        setState((prev) => ({
          ...prev,
          jobId,
          status: 'success',
          progress: 100,
          progressLabel: null,
          result: {
            recordCount: data.result?.recordCount,
            insertedCount: data.result?.insertedCount,
            updatedCount: data.result?.updatedCount,
            unchangedCount: data.result?.unchangedCount,
            duplicateCount: data.result?.duplicateCount,
            newProducts: data.result?.newProducts,
            periodStart: data.result?.periodStart,
            periodEnd: data.result?.periodEnd,
            warnings: data.result?.warnings,
            storeId: data.result?.storeId ?? null,
          },
        }))

        if (data.result?.storeId && !stores.some((store) => store.id === data.result?.storeId)) {
          setStoreId(data.result.storeId)
        }
        refreshUploadStatus()
        return
      }
    }
  }

  async function uploadFile(type: UploadType) {
    const state = type === 'income' ? incomeState : type === 'ads' ? adsState : type === 'ads_product' ? adsProductState : ordersAllState
    const setState = type === 'income' ? setIncomeState : type === 'ads' ? setAdsState : type === 'ads_product' ? setAdsProductState : setOrdersAllState
    if (!state.file) return

    trackEvent('upload_started', {
      upload_type: type,
      marketplace,
      has_store_selected: Boolean(storeId),
    })

    setState((prev) => ({
      ...prev,
      status: 'uploading',
      progress: 10,
      progressLabel: 'Mengunggah file...',
      result: null,
    }))

    const formData = new FormData()
    formData.append('file', state.file)
    formData.append('marketplace', marketplace)
    if (storeId) formData.append('storeId', storeId)

    const endpoint = type === 'ads_product'
      ? '/api/parse/ads-product'
      : type === 'orders_all'
      ? '/api/parse/orders-all'
      : `/api/parse/${type}`

    try {
      setState((prev) => ({ ...prev, progress: 20, progressLabel: 'Masuk antrean upload...' }))
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        trackEvent('upload_failed', {
          upload_type: type,
          stage: 'request',
        })

        setState((prev) => ({
          ...prev,
          status: 'error',
          progress: 0,
          progressLabel: null,
          result: { error: data.error ?? 'Upload gagal' },
        }))
        return
      }

      setState((prev) => ({
        ...prev,
        jobId: data.id ?? null,
        status: 'uploading',
        progress: Math.max(15, data.progress ?? 15),
        progressLabel: data.progressLabel ?? 'Masuk antrean upload',
      }))
      if (data.id) {
        await pollUploadJob(type, data.id)
      }
    } catch {
      trackEvent('upload_failed', {
        upload_type: type,
        stage: 'network',
      })

      setState((prev) => ({
        ...prev,
        status: 'error',
        progress: 0,
        progressLabel: null,
        result: { error: 'Koneksi gagal. Cek internet kamu.' },
      }))
    }
  }

  const hasFiles = incomeState.file || adsState.file || adsProductState.file || ordersAllState.file
  const incomeEnabled = !statusLoading && (hasOrdersAllData || ordersAllState.status === 'success')
  const canUploadIncome = incomeEnabled && incomeState.file && incomeState.status === 'idle'
  const canUploadAds = adsState.file && adsState.status === 'idle'
  const canUploadAdsProduct = adsProductState.file && adsProductState.status === 'idle'
  const canUploadOrdersAll = ordersAllState.file && ordersAllState.status === 'idle'
  const canUploadAny = canUploadIncome || canUploadAds || canUploadAdsProduct || canUploadOrdersAll

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Upload Data</h1>
          <p className="text-muted-foreground mt-1">
            Upload laporan dari Shopee Seller Center untuk mulai analisis.
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex gap-2">
            <RecalculateHppButton storeId={storeId || null} />
            <ResetDataDialog storeId={storeId || null} />
          </div>
        </div>
      </div>

      {/* Store + marketplace selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <StoreIcon className="h-4 w-4 text-primary" />
            Pilih Toko Tujuan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {storesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat daftar toko...
            </div>
          ) : stores.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Kamu belum punya toko. Kami akan otomatis buat &quot;Toko Utama&quot; saat upload
                pertama, atau kamu bisa{' '}
                <DashboardLink href="/dashboard/stores?new=1" className="underline font-medium">
                  buat toko dulu di sini
                </DashboardLink>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Toko</label>
                <Select value={storeId} onValueChange={(v) => {
                  if (!v) return
                  const selectedStore = stores.find((store) => store.id === v)
                  trackEvent('upload_store_selected', {
                    marketplace: selectedStore?.marketplace ?? marketplace,
                  })
                  setStoreId(v)
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih toko" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{' '}
                        <span className="text-muted-foreground text-xs">
                          ({s.marketplace})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Marketplace (ikut toko)
                </label>
                <Select value={marketplace} onValueChange={(v) => v && setMarketplace(v)} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Upload akan menambah data ke toko yang dipilih.
            </p>
            <DashboardLink href="/dashboard/stores?new=1">
              <Button variant="ghost" size="sm" className="gap-2 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Tambah Toko
              </Button>
            </DashboardLink>
          </div>
        </CardContent>
      </Card>

      {/* Upload zones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">File Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Workflow banner: Order.all must come first */}
          {!statusLoading && !hasOrdersAllData && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-xs">
                <strong>Upload <span className="text-teal-700">Order.all</span> dulu sebelum Income.</strong>{' '}
                File Order.all berisi mapping produk per pesanan (SKU + nama + qty) yang dipakai untuk auto-create
                master produk dan menghitung HPP. Income hanya berisi data finansial — tanpa Order.all, HPP tidak
                bisa dihitung untuk pesanan income.{' '}
                <span className="block mt-1 text-amber-700/80">
                  Data Iklan (Summary &amp; per Produk) tetap bisa di-upload kapan saja.
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Order Order.all → Income → Ads → Ads-product (enforces workflow) */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DropZone
              type="orders_all"
              accept=".xlsx"
              state={ordersAllState}
              onChange={(f) => setFile('orders_all', f)}
              onRemove={() => removeFile('orders_all')}
            />
            <DropZone
              type="income"
              accept=".xlsx"
              state={incomeState}
              onChange={(f) => setFile('income', f)}
              onRemove={() => removeFile('income')}
              disabled={statusLoading || (!hasOrdersAllData && ordersAllState.status !== 'success')}
              disabledReason={statusLoading ? undefined : 'Upload Order.all dulu untuk mengisi master produk'}
            />
            <DropZone
              type="ads"
              accept=".csv"
              state={adsState}
              onChange={(f) => setFile('ads', f)}
              onRemove={() => removeFile('ads')}
            />
            <DropZone
              type="ads_product"
              accept=".csv"
              state={adsProductState}
              onChange={(f) => setFile('ads_product', f)}
              onRemove={() => removeFile('ads_product')}
            />
          </div>

          {hasFiles && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2 flex-wrap">
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
              {canUploadAdsProduct && (
                <Button
                  variant={canUploadIncome || canUploadAds ? 'outline' : 'default'}
                  className="gap-2"
                  onClick={() => uploadFile('ads_product')}
                  disabled={adsProductState.status === 'uploading'}
                >
                  <Upload className="h-4 w-4" />
                  Proses Data per Produk
                </Button>
              )}
              {canUploadOrdersAll && (
                <Button
                  variant={canUploadIncome || canUploadAds || canUploadAdsProduct ? 'outline' : 'default'}
                  className="gap-2"
                  onClick={() => uploadFile('orders_all')}
                  disabled={ordersAllState.status === 'uploading'}
                >
                  <Upload className="h-4 w-4" />
                  Proses Semua Pesanan
                </Button>
              )}
              {canUploadAny && [canUploadIncome, canUploadAds, canUploadAdsProduct, canUploadOrdersAll].filter(Boolean).length > 1 && (
                <Button
                  variant="secondary"
                  className="gap-2 sm:ml-auto"
                  onClick={async () => {
                    trackEvent('upload_process_all_clicked', {
                      marketplace,
                      selected_types_count: [canUploadIncome, canUploadAds, canUploadAdsProduct, canUploadOrdersAll].filter(Boolean).length,
                    })
                    if (canUploadIncome) await uploadFile('income')
                    if (canUploadOrdersAll) await uploadFile('orders_all')
                    if (canUploadAds) await uploadFile('ads')
                    if (canUploadAdsProduct) await uploadFile('ads_product')
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
      {(incomeState.status === 'success' || adsState.status === 'success' || adsProductState.status === 'success' || ordersAllState.status === 'success') && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <CheckCircle className="h-5 w-5" />
              Upload selesai! Langkah selanjutnya:
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {incomeState.status === 'success' && (
                <DashboardLink href="/dashboard/profit">
                  <Button size="sm" className="gap-2 w-full sm:w-auto">
                    Lihat Analisis Profit
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </DashboardLink>
              )}
              {adsState.status === 'success' && (
                <DashboardLink href="/dashboard/ads">
                  <Button size="sm" variant={incomeState.status === 'success' ? 'outline' : 'default'} className="gap-2 w-full sm:w-auto">
                    Lihat Analisis Iklan
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </DashboardLink>
              )}
              {adsProductState.status === 'success' && (
                <DashboardLink href="/dashboard/ads">
                  <Button size="sm" variant={(incomeState.status === 'success' || adsState.status === 'success') ? 'outline' : 'default'} className="gap-2 w-full sm:w-auto">
                    Lihat Breakdown per Produk
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </DashboardLink>
              )}
              <DashboardLink href="/dashboard/products">
                <Button size="sm" variant="ghost" className="gap-2 w-full sm:w-auto">
                  Isi HPP Produk
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </DashboardLink>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guide */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">Urutan upload &amp; cara download dari Shopee:</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">1. Order.all / Semua Pesanan (.xlsx)</span> <span className="text-amber-700 text-xs">— WAJIB UPLOAD DULUAN</span>
              <div className="text-xs ml-4 mt-0.5">Seller Center → Pesanan Saya → Export Pesanan (pilih semua status). Ini sumber master produk &amp; mapping SKU.</div>
            </div>
            <div>
              <span className="font-medium text-foreground">2. Data Penghasilan / Income (.xlsx)</span>
              <div className="text-xs ml-4 mt-0.5">Seller Center → Keuangan → Penghasilan Saya → Download. Berisi data finansial pesanan yang dananya sudah dilepas.</div>
            </div>
            <div className="pt-1 border-t">
              <span className="font-medium text-foreground">Data Iklan (.csv)</span> <span className="text-xs text-muted-foreground">— independent, boleh kapan saja</span>
              <div className="text-xs ml-4 mt-0.5">Shopee Ads → Laporan → Download Laporan Produk</div>
            </div>
            <div>
              <span className="font-medium text-foreground">Data per Produk GMV Max Auto (.csv)</span> <span className="text-xs text-muted-foreground">— independent</span>
              <div className="text-xs ml-4 mt-0.5">Shopee Ads → Shop GMV Max → Laporan → Download Detail Produk</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
