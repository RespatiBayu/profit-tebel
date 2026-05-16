import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserAccess, getManagedRole } from '@/lib/roles'
import type { AppUserRole } from '@/types'

type ManagedUserRow = {
  id: string
  email: string | null
  full_name: string | null
  role: AppUserRole
  created_at: string
  created_by_id: string | null
}

type MembershipRow = {
  user_id: string
  store_id: string
}

type StoreRow = {
  id: string
  name: string
  marketplace: string
  user_id: string
}

async function requireManager() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!access.isPrivileged) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const managedRole = getManagedRole(access.role)
  if (!managedRole) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { access, managedRole }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return fallback
}

async function listOwnedStores(service: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data: stores, error } = await service
    .from('stores')
    .select('id,name,marketplace,user_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (stores ?? []) as StoreRow[]
}

export async function GET() {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const service = await createServiceClient()
  const ownedStores = auth.access.role === 'admin'
    ? await listOwnedStores(service, auth.access.user.id)
    : []

  const { data: users, error: usersError } = await service
    .from('profiles')
    .select('id,email,full_name,role,created_at,created_by_id')
    .eq('created_by_id', auth.access.user.id)
    .eq('role', auth.managedRole)
    .order('created_at', { ascending: false })

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const typedUsers = ((users ?? []) as ManagedUserRow[]).map((user) => ({
    ...user,
    role: user.role,
  }))

  const userIds = typedUsers.map((user) => user.id)
  const ownedStoreIds = ownedStores.map((store) => store.id)
  const storesById = new Map(ownedStores.map((store) => [store.id, store]))
  const membershipsByUserId = new Map<string, StoreRow[]>()

  if (auth.managedRole === 'member' && userIds.length > 0 && ownedStoreIds.length > 0) {
    const { data: memberships, error: membershipsError } = await service
      .from('store_memberships')
      .select('user_id,store_id')
      .in('user_id', userIds)
      .in('store_id', ownedStoreIds)

    if (membershipsError) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 })
    }

    for (const membership of (memberships ?? []) as MembershipRow[]) {
      const store = storesById.get(membership.store_id)
      if (!store) continue
      const list = membershipsByUserId.get(membership.user_id) ?? []
      list.push(store)
      membershipsByUserId.set(membership.user_id, list)
    }
  }

  return NextResponse.json({
    actorRole: auth.access.role,
    managedRole: auth.managedRole,
    users: typedUsers.map((profile) => ({
      ...profile,
      stores: (membershipsByUserId.get(profile.id) ?? []).map((store) => ({
        id: store.id,
        name: store.name,
        marketplace: store.marketplace,
      })),
    })),
    stores: ownedStores.map((store) => ({
      id: store.id,
      name: store.name,
      marketplace: store.marketplace,
    })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null) as {
    email?: string
    password?: string
    fullName?: string | null
    storeIds?: string[]
  } | null

  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''
  const fullName = body?.fullName?.trim() || null
  const storeIds = Array.from(
    new Set((body?.storeIds ?? []).map((id) => id.trim()).filter(Boolean))
  )

  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
  }

  const service = await createServiceClient()
  let selectedStores: StoreRow[] = []

  if (auth.managedRole === 'member' && storeIds.length > 0) {
    const { data: stores, error: storesError } = await service
      .from('stores')
      .select('id,name,marketplace,user_id')
      .eq('user_id', auth.access.user.id)
      .in('id', storeIds)

    if (storesError) {
      return NextResponse.json({ error: storesError.message }, { status: 500 })
    }

    selectedStores = (stores ?? []) as StoreRow[]

    if (selectedStores.length !== storeIds.length) {
      return NextResponse.json(
        { error: 'Sebagian toko tidak ditemukan atau bukan milik admin ini' },
        { status: 400 }
      )
    }
  }

  const { data: createdAuth, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  })

  if (createError || !createdAuth.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Gagal membuat akun user' },
      { status: 400 }
    )
  }

  const createdUserId = createdAuth.user.id

  try {
    const { error: profileError } = await service
      .from('profiles')
      .upsert(
        {
          id: createdUserId,
          email,
          full_name: fullName ?? email.split('@')[0] ?? null,
          is_paid: false,
          role: auth.managedRole,
          created_by_id: auth.access.user.id,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      throw profileError
    }

    if (auth.managedRole === 'member' && selectedStores.length > 0) {
      const memberships = selectedStores.map((store) => ({
        store_id: store.id,
        user_id: createdUserId,
        role: 'member' as const,
      }))

      const { error: membershipError } = await service
        .from('store_memberships')
        .upsert(memberships, { onConflict: 'store_id,user_id' })

      if (membershipError) {
        throw membershipError
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createdUserId,
        email,
        full_name: fullName,
        role: auth.managedRole,
        stores: selectedStores,
      },
    })
  } catch (error) {
    await service.auth.admin.deleteUser(createdUserId)
    const message = getErrorMessage(error, 'Gagal menyimpan user baru')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
