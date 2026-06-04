'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export default function NewStockOpnamePage() {
  const router = useRouter()
  const today  = new Date().toISOString().slice(0, 10)

  const [name, setName]   = useState(`Opname ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`)
  const [date, setDate]   = useState(today)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nama sesi wajib diisi'); return }

    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/inventory/stock-opname', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), date, notes: notes.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal membuat sesi')

      toast.success('Sesi opname berhasil dibuat')
      router.push(`/dashboard/inventory/stock-opname/${json.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/inventory/stock-opname" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Buat Sesi Opname
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Semua item inventori akan dimasukkan ke sesi ini.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="op-name">Nama Sesi <span className="text-destructive">*</span></Label>
          <Input
            id="op-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Opname Mei 2026"
            className="h-10"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="op-date">Tanggal Opname</Label>
          <Input
            id="op-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="op-notes">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
          <Textarea
            id="op-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="cth. Gudang utama, akhir bulan"
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">Yang terjadi setelah dibuat:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Semua item di inventori masuk ke daftar opname</li>
            <li>Saldo stok sistem di-snapshot saat ini</li>
            <li>Kamu isi hasil hitungan fisik di halaman berikutnya</li>
            <li>Saat finalisasi, selisih otomatis dicatat sebagai penyesuaian</li>
          </ul>
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard/inventory/stock-opname"
            className="flex-1 h-10 inline-flex items-center justify-center rounded-xl border border-border bg-white/88 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Batal
          </Link>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Buat Sesi Opname
          </Button>
        </div>
      </form>
    </div>
  )
}
