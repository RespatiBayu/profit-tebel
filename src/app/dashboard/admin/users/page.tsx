'use client'

import { useEffect, useState } from 'react'
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
  Loader2,
  ShieldCheck,
  Store as StoreIcon,
  UserPlus,
  Users,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react'

type UserRole = 'superadmin' | 'admin' | 'member'
type ManagedRole = 'admin' | 'member'
type DialogMode = 'create' | 'edit' | null

type ManagedUser = {
  id: string
  email: string | null
  full_name: string | null
  role: ManagedRole
  created_at: string
  stores: Array<{
    id: string
    name: string
    marketplace: string
  }>
}

type AssignableStore = {
  id: string
  name: string
  marketplace: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [stores, setStores] = useState<AssignableStore[]>([])
  const [actorRole, setActorRole] = useState<UserRole | null>(null)
  const [managedRole, setManagedRole] = useState<ManagedRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/admin/users')
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal memuat data pengguna')
      setLoading(false)
      return
    }

    setUsers(data.users ?? [])
    setStores(data.stores ?? [])
    setActorRole(data.actorRole ?? null)
    setManagedRole(data.managedRole ?? null)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function resetForm() {
    setEmail('')
    setPassword('')
    setFullName('')
    setSelectedStores([])
    setEditingUser(null)
    setError(null)
  }

  function openCreate() {
    resetForm()
    setDialogMode('create')
    setDialogOpen(true)
  }

  function openEdit(user: ManagedUser) {
    setDialogMode('edit')
    setEditingUser(user)
    setFullName(user.full_name ?? '')
    setEmail(user.email ?? '')
    setPassword('')
    setSelectedStores(user.stores.map((store) => store.id))
    setError(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setDialogMode(null)
    setEditingUser(null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const isEdit = dialogMode === 'edit' && editingUser
    const url = isEdit ? `/api/admin/users/${editingUser.id}` : '/api/admin/users'
    const method = isEdit ? 'PATCH' : 'POST'

    const payload = {
      email,
      password,
      fullName,
      storeIds: managedRole === 'member' ? selectedStores : [],
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal menyimpan akun')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    closeDialog()
    resetForm()
    await loadData()
  }

  async function handleDelete(user: ManagedUser) {
    const targetLabel = user.full_name || user.email || 'akun ini'
    const confirmed = confirm(
      `Hapus ${targetLabel}?\n\nAksi ini akan menghapus akses login dan data akun tersebut.`
    )

    if (!confirmed) {
      return
    }

    setDeletingId(user.id)

    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? 'Gagal menghapus akun')
      setDeletingId(null)
      return
    }

    setDeletingId(null)
    await loadData()
  }

  const storeOptions = stores.map((store) => ({
    value: store.id,
    label: `${store.name} (${store.marketplace})`,
  }))

  const pageTitle =
    actorRole === 'superadmin' ? 'Manajemen Admin' : 'Manajemen Member'
  const pageDescription =
    actorRole === 'superadmin'
      ? 'Superadmin dapat membuat, mengubah, dan menghapus akun admin yang dibuatnya.'
      : 'Admin dapat membuat, mengubah, dan menghapus akun member di bawah akunnya sendiri.'
  const createLabel = managedRole === 'admin' ? 'Buat Admin' : 'Buat Member'
  const dialogTitle =
    dialogMode === 'edit'
      ? managedRole === 'admin'
        ? 'Edit Akun Admin'
        : 'Edit Akun Member'
      : managedRole === 'admin'
        ? 'Buat Akun Admin'
        : 'Buat Akun Member'
  const dialogDescription =
    managedRole === 'admin'
      ? 'Admin akan membuat toko dan mengelola member-nya sendiri setelah akun aktif.'
      : 'Member bisa dibuat tanpa toko dulu. Toko bisa di-assign sekarang atau nanti.'
  const roleBadgeLabel = managedRole === 'admin' ? 'Admin' : 'Member'

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1">{pageDescription}</p>
        </div>
        <Button onClick={openCreate} className="gap-2" disabled={!managedRole}>
          <UserPlus className="h-4 w-4" />
          {createLabel}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total {roleBadgeLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {managedRole === 'member' ? 'Toko yang Bisa Di-assign' : 'Akun Siap Dikelola'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {managedRole === 'member' ? stores.length : users.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {managedRole === 'member' ? 'Member Tanpa Toko' : 'Admin Baru'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {managedRole === 'member'
                ? users.filter((user) => user.stores.length === 0).length
                : users.length}
            </p>
          </CardContent>
        </Card>
      </div>

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
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{user.full_name || user.email || 'Tanpa Nama'}</p>
                      <Badge variant="outline" className="capitalize">
                        {user.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground break-all">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Dibuat {new Date(user.created_at).toLocaleDateString('id-ID')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 lg:items-end">
                    {managedRole === 'member' && (
                      <div className="space-y-2 lg:max-w-[420px]">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <StoreIcon className="h-3.5 w-3.5" />
                          Toko yang bisa diakses
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {user.stores.length === 0 ? (
                            <Badge variant="outline">Belum ada toko</Badge>
                          ) : (
                            user.stores.map((store) => (
                              <Badge key={store.id} variant="outline">
                                {store.name} ({store.marketplace})
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                      >
                        {deletingId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog()
            return
          }

          setDialogOpen(true)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Nama</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={`Nama ${roleBadgeLabel.toLowerCase()}`}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@domain.com"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">
                {dialogMode === 'edit' ? 'Password Baru (opsional)' : 'Password Sementara'}
              </Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  dialogMode === 'edit' ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'
                }
                required={dialogMode === 'create'}
                className="mt-1"
              />
            </div>

            {managedRole === 'member' && (
              <div>
                <Label>Toko yang Bisa Diakses</Label>
                <div className="mt-1">
                  <MultiSelect
                    options={storeOptions}
                    selected={selectedStores}
                    onChange={setSelectedStores}
                    placeholder="Pilih toko (opsional)"
                    allLabel="Semua toko"
                    className="w-full h-10 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Member boleh dibuat tanpa toko. Kamu bisa assign akses toko nanti.
                </p>
              </div>
            )}

            {managedRole === 'member' && stores.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Kamu belum punya toko. Member tetap bisa dibuat sekarang tanpa akses toko.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeDialog}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {dialogMode === 'edit' ? 'Simpan Perubahan' : createLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
