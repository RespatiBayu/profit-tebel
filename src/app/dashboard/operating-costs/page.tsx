'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Copy, Loader2, Receipt, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { OperatingCost, OperatingCostCategory } from '@/types'

const CATEGORIES: { value: OperatingCostCategory; label: string }[] = [
  { value: 'utilities', label: 'Listrik & Air' },
  { value: 'rent', label: 'Sewa Tempat' },
  { value: 'salary', label: 'Gaji Karyawan' },
  { value: 'internet', label: 'Internet & Pulsa' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'transport', label: 'Transport' },
  { value: 'supplies', label: 'Perlengkapan' },
  { value: 'other', label: 'Lainnya' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<string, string>

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
function parseAmount(s: string) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}
function formatThousands(raw: string) {
  const cleaned = raw.replace(/[^0-9]/g, '')
  if (!cleaned) return ''
  return Number(cleaned).toLocaleString('id-ID')
}

type Store = { id: string; name: string }

type FormState = {
  id: string | null
  name: string
  category: OperatingCostCategory
  amount: string
  store_id: string  // '' = bisnis-wide
  notes: string
}

const emptyForm: FormState = { id: null, name: '', category: 'other', amount: '', store_id: '', notes: '' }

export default function OperatingCostsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [costs, setCosts] = useState<OperatingCost[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const years = useMemo(() => {
    const y = now.getFullYear()
    return [y + 1, y, y - 1, y - 2]
  }, [now])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/operating-costs?year=${year}&month=${month}`)
      const data = await res.json() as { costs?: OperatingCost[] }
      setCosts(data.costs ?? [])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/stores').then((r) => r.json()).then((d) => setStores(d.stores ?? [])).catch(() => {})
  }, [])

  const total = useMemo(() => costs.reduce((s, c) => s + Number(c.amount), 0), [costs])
  const storeName = (id: string | null) => id ? (stores.find((s) => s.id === id)?.name ?? 'Toko') : 'Semua toko'

  function openAdd() { setForm(emptyForm); setShowForm(true); setNotice(null) }
  function openEdit(c: OperatingCost) {
    setForm({
      id: c.id,
      name: c.name,
      category: c.category,
      amount: c.amount > 0 ? formatThousands(String(c.amount)) : '',
      store_id: c.store_id ?? '',
      notes: c.notes ?? '',
    })
    setShowForm(true); setNotice(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setNotice({ type: 'error', text: 'Nama biaya wajib diisi' }); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        amount: parseAmount(form.amount),
        period_year: year,
        period_month: month,
        store_id: form.store_id || null,
        notes: form.notes.trim() || null,
      }
      const url = form.id ? `/api/operating-costs/${form.id}` : '/api/operating-costs'
      const method = form.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setNotice({ type: 'error', text: data.error ?? 'Gagal menyimpan' }); return }
      setShowForm(false); setForm(emptyForm)
      setNotice({ type: 'success', text: form.id ? 'Biaya diperbarui' : 'Biaya ditambahkan' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus biaya ini?')) return
    const res = await fetch(`/api/operating-costs/${id}`, { method: 'DELETE' })
    if (res.ok) { setCosts((prev) => prev.filter((c) => c.id !== id)); setNotice({ type: 'success', text: 'Biaya dihapus' }) }
  }

  async function handleCopyLastMonth() {
    const fromMonth = month === 1 ? 12 : month - 1
    const fromYear = month === 1 ? year - 1 : year
    if (!confirm(`Salin semua biaya dari ${MONTHS[fromMonth - 1]} ${fromYear} ke ${MONTHS[month - 1]} ${year}?`)) return
    setCopying(true)
    setNotice(null)
    try {
      const res = await fetch('/api/operating-costs/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_year: fromYear, from_month: fromMonth, to_year: year, to_month: month }),
      })
      const data = await res.json() as { copied?: number; error?: string }
      if (!res.ok) { setNotice({ type: 'error', text: data.error ?? 'Gagal menyalin' }); return }
      setNotice({ type: 'success', text: `${data.copied ?? 0} biaya disalin dari ${MONTHS[fromMonth - 1]} ${fromYear}` })
      await load()
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Biaya Operasional
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catat biaya rutin (listrik, sewa, gaji, dll). Otomatis masuk ke Profit Bersih di Dashboard Analisis.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Tambah Biaya</Button>
        <Button variant="outline" onClick={handleCopyLastMonth} disabled={copying} className="gap-2">
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Salin dari bulan lalu
        </Button>
      </div>

      {notice && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${
          notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
        }`}>{notice.text}</div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
          <h2 className="font-semibold text-sm">{form.id ? 'Edit Biaya' : 'Tambah Biaya'} — {MONTHS[month - 1]} {year}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Nama Biaya <span className="text-destructive">*</span></Label>
              <Input placeholder="cth. Sewa Toko, Gaji Admin" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as OperatingCostCategory })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Jumlah (Rp) <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input inputMode="numeric" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: formatThousands(e.target.value) })} className="h-10 pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Berlaku untuk</Label>
              <Select value={form.store_id || 'all'} onValueChange={(v) => setForm({ ...form, store_id: v && v !== 'all' ? v : '' })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua toko (bisnis-wide)</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Catatan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
              <Input placeholder="cth. Periode 1-31, dibayar tgl 5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-10" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }} disabled={saving}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? 'Simpan Perubahan' : 'Tambah'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Berlaku</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
            ) : costs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <Receipt className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Belum ada biaya operasional di {MONTHS[month - 1]} {year}.</p>
                  <p className="text-xs text-muted-foreground mt-1">Klik &quot;Tambah Biaya&quot; atau &quot;Salin dari bulan lalu&quot;.</p>
                </TableCell>
              </TableRow>
            ) : (
              costs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.notes && <span className="block text-xs text-muted-foreground">{c.notes}</span>}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{CATEGORY_LABEL[c.category] ?? 'Lainnya'}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{storeName(c.store_id)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatRp(Number(c.amount))}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {costs.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">Total Biaya Operasional · {MONTHS[month - 1]} {year}</span>
            <span className="text-lg font-bold text-red-600 tabular-nums">{formatRp(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
