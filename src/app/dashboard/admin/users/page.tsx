'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Loader2, ShieldCheck, Store as StoreIcon, UserPlus, Users,
  AlertCircle, Pencil, Trash2, Upload, FileSpreadsheet,
  CheckCircle2, XCircle, Download, Crown, Sparkles,
} from 'lucide-react'

type UserRole = 'superadmin' | 'admin' | 'member'
type ManagedRole = 'admin' | 'member'
type DialogMode = 'create' | 'edit' | null
type ActiveTab = 'list' | 'import'

type ManagedUser = {
  id: string
  email: string | null
  full_name: string | null
  role: ManagedRole
  created_at: string
  subscription_plan: string | null
  subscription_expires_at: string | null
  stores: Array<{ id: string; name: string; marketplace: string }>
}

type AssignableStore = { id: string; name: string; marketplace: string }

type BulkResult = {
  email: string
  name: string
  status: 'success' | 'error'
  tempPassword?: string
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPro(user: ManagedUser): boolean {
  if (user.subscription_plan !== 'monthly' && user.subscription_plan !== 'lifetime') return false
  if (user.subscription_plan === 'lifetime') return true
  if (!user.subscription_expires_at) return false
  return new Date(user.subscription_expires_at) > new Date()
}

function proExpiresLabel(user: ManagedUser): string | null {
  if (!user.subscription_expires_at) return null
  const d = new Date(user.subscription_expires_at)
  if (d <= new Date()) return 'Kedaluwarsa'
  return `s/d ${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [stores, setStores] = useState<AssignableStore[]>([])
  const [actorRole, setActorRole] = useState<UserRole | null>(null)
  const [managedRole, setManagedRole] = useState<ManagedRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ActiveTab>('list')

  // Single-user form dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Bulk import state
  const fileRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<BulkResult[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Gagal memuat data'); setLoading(false); return }
    setUsers(data.users ?? [])
    setStores(data.stores ?? [])
    setActorRole(data.actorRole ?? null)
    setManagedRole(data.managedRole ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Single user form ────────────────────────────────────────────────────────

  function resetForm() {
    setEmail(''); setPassword(''); setFullName(''); setSelectedStores([]); setEditingUser(null); setError(null)
  }

  function openCreate() { resetForm(); setDialogMode('create'); setDialogOpen(true) }

  function openEdit(user: ManagedUser) {
    setDialogMode('edit'); setEditingUser(user)
    setFullName(user.full_name ?? ''); setEmail(user.email ?? ''); setPassword('')
    setSelectedStores(user.stores.map((s) => s.id)); setError(null); setDialogOpen(true)
  }

  function closeDialog() { setDialogOpen(false); setDialogMode(null); setEditingUser(null); setError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    const isEdit = dialogMode === 'edit' && editingUser
    const url    = isEdit ? `/api/admin/users/${editingUser.id}` : '/api/admin/users'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, storeIds: managedRole === 'member' ? selectedStores : [] }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Gagal menyimpan akun'); setSubmitting(false); return }
    setSubmitting(false); closeDialog(); resetForm(); await loadData()
  }

  async function handleDelete(user: ManagedUser) {
    if (!confirm(`Hapus ${user.full_name || user.email || 'akun ini'}?\n\nAksi ini menghapus akses login dan data akun.`)) return
    setDeletingId(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Gagal menghapus akun'); setDeletingId(null); return }
    setDeletingId(null); await loadData()
  }

  async function handleTogglePro(user: ManagedUser) {
    const grant = !isPro(user)
    const label = grant ? 'Grant Pro 30 hari' : 'Cabut akses Pro'
    if (!confirm(`${label} untuk ${user.full_name || user.email}?`)) return
    setTogglingId(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantPro: grant }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Gagal update subscription'); setTogglingId(null); return }
    setTogglingId(null); await loadData()
  }

  // ── Bulk import ─────────────────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setImportFile(f)
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true); setImportError(null); setImportResults(null)
    const form = new FormData()
    form.append('file', importFile)
    try {
      const res = await fetch('/api/admin/users/bulk', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error ?? 'Gagal import'); return }
      setImportResults(data.results)
      await loadData()
    } catch {
      setImportError('Gagal terhubung ke server.')
    } finally {
      setImporting(false)
    }
  }

  function downloadResults() {
    if (!importResults) return
    const header = 'Email,Nama,Status,Password Sementara,Keterangan\n'
    const rows = importResults.map((r) =>
      `${r.email},${r.name},"${r.status === 'success' ? 'Berhasil' : 'Gagal'}","${r.tempPassword ?? ''}","${r.error ?? ''}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'hasil-import-user.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Labels ──────────────────────────────────────────────────────────────────

  const pageTitle       = actorRole === 'superadmin' ? 'Manajemen Admin' : 'Manajemen Member'
  const pageDesc        = actorRole === 'superadmin'
    ? 'Superadmin dapat membuat, mengubah, dan menghapus akun admin yang dibuatnya.'
    : 'Admin dapat membuat dan mengelola akun member, termasuk akses paket Pro Inventori.'
  const createLabel     = managedRole === 'admin' ? 'Buat Admin' : 'Tambah Member'
  const roleBadgeLabel  = managedRole === 'admin' ? 'Admin' : 'Member'
  const storeOptions    = stores.map((s) => ({ value: s.id, label: `${s.name} (${s.marketplace})` }))

  const proCount   = users.filter(isPro).length
  const basicCount = users.length - proCount

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{pageDesc}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate} className="gap-2" disabled={!managedRole}>
            <UserPlus className="h-4 w-4" />
            {createLabel}
          </Button>
          {managedRole === 'member' && (
            <Button variant="outline" className="gap-2" onClick={() => { setTab('import'); setImportResults(null); setImportError(null); setImportFile(null) }}>
              <Upload className="h-4 w-4" />
              Import Excel
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total {roleBadgeLabel}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{users.length}</p></CardContent>
        </Card>
        {managedRole === 'member' ? (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Crown className="h-3.5 w-3.5 text-amber-500" />Paket Pro</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-amber-600">{proCount}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Paket Basic</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-muted-foreground">{basicCount}</p></CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Akun Siap Dikelola</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{users.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Admin Baru</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{users.length}</p></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      {managedRole === 'member' && (
        <div className="flex gap-1 border-b">
          {(['list', 'import'] as ActiveTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'list' ? `Daftar ${roleBadgeLabel}` : 'Import Excel'}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab: List ── */}
      {tab === 'list' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Daftar {roleBadgeLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Memuat data akun...
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Belum ada akun {roleBadgeLabel.toLowerCase()} yang dibuat.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const pro = isPro(user)
                  const expLabel = proExpiresLabel(user)
                  return (
                    <div key={user.id} className="rounded-xl border p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{user.full_name || user.email || 'Tanpa Nama'}</p>
                          <Badge variant="outline" className="capitalize">{user.role}</Badge>
                          {managedRole === 'member' && (
                            pro ? (
                              <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">
                                <Crown className="h-3 w-3" /> Pro
                                {expLabel && <span className="font-normal opacity-80 ml-1">{expLabel}</span>}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-muted-foreground">Basic</Badge>
                            )
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground break-all">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Dibuat {new Date(user.created_at).toLocaleDateString('id-ID')}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 lg:items-end shrink-0">
                        {managedRole === 'member' && user.stores.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 w-full">
                              <StoreIcon className="h-3 w-3" /> Toko:
                            </p>
                            {user.stores.map((s) => (
                              <Badge key={s.id} variant="outline" className="text-xs">{s.name}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          {/* Pro toggle — only for member managed by admin */}
                          {managedRole === 'member' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className={`gap-1.5 ${pro ? 'text-muted-foreground' : 'text-amber-600 border-amber-300 hover:bg-amber-50'}`}
                              onClick={() => handleTogglePro(user)}
                              disabled={togglingId === user.id}
                            >
                              {togglingId === user.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Sparkles className="h-3.5 w-3.5" />
                              }
                              {pro ? 'Cabut Pro' : 'Grant Pro'}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                            <Pencil className="h-4 w-4 mr-1.5" /> Edit
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(user)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id
                              ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              : <Trash2 className="h-4 w-4 mr-1.5" />
                            }
                            Hapus
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Import Excel ── */}
      {tab === 'import' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Import Member via Excel
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload file <strong>.xlsx</strong> dengan kolom <code className="bg-muted px-1 py-0.5 rounded text-xs">email</code> (wajib) dan <code className="bg-muted px-1 py-0.5 rounded text-xs">nama</code> (opsional).
                Sistem akan generate password sementara untuk tiap akun.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Download template */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                <span>Gunakan template:</span>
                <a
                  href="/api/admin/users/template"
                  download="template-import-member.xlsx"
                  className="text-primary underline hover:no-underline"
                >
                  Download Template Excel
                </a>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f) }}
                />
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                {importFile ? (
                  <div>
                    <p className="font-medium text-sm">{importFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-sm">Drag & drop file di sini atau klik untuk browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Format: .xlsx, .xls, .csv — Maks. 200 email</p>
                  </div>
                )}
              </div>

              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                {importFile && (
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="gap-2"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importing ? 'Mengimport...' : 'Mulai Import'}
                  </Button>
                )}
                {importFile && (
                  <Button variant="outline" onClick={() => { setImportFile(null); setImportResults(null); setImportError(null); if (fileRef.current) fileRef.current.value = '' }}>
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {importResults && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    Hasil Import
                    <Badge className="bg-green-100 text-green-700 border-green-300">
                      {importResults.filter((r) => r.status === 'success').length} berhasil
                    </Badge>
                    {importResults.filter((r) => r.status === 'error').length > 0 && (
                      <Badge variant="destructive">
                        {importResults.filter((r) => r.status === 'error').length} gagal
                      </Badge>
                    )}
                  </CardTitle>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadResults}>
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Simpan password sementara di bawah — tidak bisa dilihat lagi setelah halaman ini ditutup.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2.5">Email</th>
                        <th className="text-left px-4 py-2.5">Nama</th>
                        <th className="text-left px-4 py-2.5">Status</th>
                        <th className="text-left px-4 py-2.5">Password Sementara</th>
                        <th className="text-left px-4 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importResults.map((r, i) => (
                        <tr key={i} className={r.status === 'error' ? 'bg-red-50/50' : ''}>
                          <td className="px-4 py-2.5 text-xs font-medium">{r.email}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.name || '—'}</td>
                          <td className="px-4 py-2.5">
                            {r.status === 'success'
                              ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Berhasil</span>
                              : <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> Gagal</span>
                            }
                          </td>
                          <td className="px-4 py-2.5">
                            {r.tempPassword
                              ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{r.tempPassword}</code>
                              : <span className="text-muted-foreground text-xs">—</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.error ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit'
                ? managedRole === 'admin' ? 'Edit Akun Admin' : 'Edit Akun Member'
                : managedRole === 'admin' ? 'Buat Akun Admin' : 'Tambah Member Baru'}
            </DialogTitle>
            <DialogDescription>
              {managedRole === 'admin'
                ? 'Admin akan membuat toko dan mengelola member-nya sendiri setelah akun aktif.'
                : 'Member bisa dibuat tanpa toko dulu. Akses toko bisa di-assign sekarang atau nanti.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Nama</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@domain.com" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">{dialogMode === 'edit' ? 'Password Baru (opsional)' : 'Password Sementara *'}</Label>
              <Input
                id="password" type="text" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={dialogMode === 'edit' ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
                required={dialogMode === 'create'}
                className="mt-1"
              />
            </div>
            {managedRole === 'member' && (
              <div>
                <Label>Toko yang Bisa Diakses</Label>
                <div className="mt-1">
                  <MultiSelect options={storeOptions} selected={selectedStores} onChange={setSelectedStores} placeholder="Pilih toko (opsional)" allLabel="Semua toko" className="w-full h-10 text-sm" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Bisa di-assign sekarang atau nanti via Edit.</p>
              </div>
            )}
            {error && (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog} disabled={submitting}>Batal</Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {dialogMode === 'edit' ? 'Simpan Perubahan' : createLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
