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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Loader2,
  ShieldCheck,
  Store as StoreIcon,
  UserPlus,
  Users,
  AlertCircle,
} from 'lucide-react'

type AdminUser = {
  id: string
  email: string | null
  full_name: string | null
  is_paid: boolean | null
  created_at: string
  stores: Array<{
    id: string
    name: string
    marketplace: string
  }>
}

type AdminStore = {
  id: string
  name: string
  marketplace: string
  owner_id: string
  owner_email: string | null
  owner_name: string | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stores, setStores] = useState<AdminStore[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isPaid, setIsPaid] = useState<'yes' | 'no'>('yes')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/admin/users')
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal memuat data admin')
      setLoading(false)
      return
    }

    setUsers(data.users ?? [])
    setStores(data.stores ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function resetForm() {
    setEmail('')
    setPassword('')
    setFullName('')
    setIsPaid('yes')
    setSelectedStores([])
    setError(null)
  }

  function openDialog() {
    resetForm()
    setDialogOpen(true)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        fullName,
        isPaid: isPaid === 'yes',
        storeIds: selectedStores,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal membuat akun user')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setDialogOpen(false)
    resetForm()
    await loadData()
  }

  const storeOptions = stores.map((store) => ({
    value: store.id,
    label: `${store.name} (${store.marketplace})`,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin User
          </h1>
          <p className="text-muted-foreground mt-1">
            Buat akun user baru dan batasi aksesnya hanya ke toko yang dipilih.
          </p>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Buat User
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
            <CardTitle className="text-sm text-muted-foreground">Total User</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Toko</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">User Aktif Berbayar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {users.filter((user) => user.is_paid).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Daftar User
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Memuat data user...
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Belum ada user yang dibuat.
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
                      <Badge variant={user.is_paid ? 'default' : 'secondary'}>
                        {user.is_paid ? 'Paid' : 'Free'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground break-all">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Dibuat {new Date(user.created_at).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <div className="space-y-2 lg:max-w-[45%]">
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Akun User Baru</DialogTitle>
            <DialogDescription>
              User yang dibuat di sini hanya akan melihat toko yang kamu assign.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Nama</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama user"
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
              <Label htmlFor="password">Password Sementara</Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label>Status Paket</Label>
              <Select value={isPaid} onValueChange={(value) => setIsPaid(value as 'yes' | 'no')}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Paid</SelectItem>
                  <SelectItem value="no">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Toko yang Bisa Diakses</Label>
              <div className="mt-1">
                <MultiSelect
                  options={storeOptions}
                  selected={selectedStores}
                  onChange={setSelectedStores}
                  placeholder="Pilih toko"
                  allLabel="Semua toko"
                  className="w-full h-10 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pilih minimal satu toko. User hanya akan melihat toko yang dipilih di sini.
              </p>
            </div>

            {stores.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Belum ada toko yang tersedia untuk di-assign ke user baru.
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
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={submitting || stores.length === 0 || selectedStores.length === 0}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Buat User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
