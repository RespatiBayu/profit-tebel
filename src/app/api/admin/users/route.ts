import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'

type AdminUserRow = {
  id: string
  email: string | null
  full_name: string | null
  is_paid: boolean | null
  created_at: string
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

type OwnerRow = {
  id: string
  email: string | null
  full_name: string | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
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

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const service = await createServiceClient()

  const [{ data: users, error: usersError }, { data: stores, error: storesError }, { data: memberships, error: membershipsError }] = await Promise.all([
    service
      .from('profiles')
      .select('id,email,full_name,is_paid,created_at')
      .order('created_at', { ascending: false }),
    service
      .from('stores')
      .select('id,name,marketplace,user_id')
      .order('created_at', { ascending: true }),
    service
      .from('store_memberships')
      .select('user_id,store_id'),
  ])

  if (usersError || storesError || membershipsError) {
    return NextResponse.json(
      { error: usersError?.message ?? storesError?.message ?? membershipsError?.message ?? 'Gagal memuat data admin' },
      { status: 500 }
    )
  }

  const typedUsers = (users ?? []) as AdminUserRow[]
  const typedStores = (stores ?? []) as StoreRow[]
  const typedMemberships = (memberships ?? []) as MembershipRow[]

  const ownerIds = Array.from(new Set(typedStores.map((store) => store.user_id)))
  const ownerById = new Map<string, OwnerRow>()

  if (ownerIds.length > 0) {
    const { data: owners, error: ownersError } = await service
      .from('profiles')
      .select('id,email,full_name')
      .in('id', ownerIds)

    if (ownersError) {
      return NextResponse.json({ error: ownersError.message }, { status: 500 })
    }

    for (const owner of (owners ?? []) as OwnerRow[]) {
      ownerById.set(owner.id, owner)
    }
  }

  const storesById = new Map(typedStores.map((store) => [store.id, store]))
  const membershipsByUserId = new Map<string, StoreRow[]>()

  for (const membership of typedMemberships) {
    const store = storesById.get(membership.store_id)
    if (!store) continue
    const list = membershipsByUserId.get(membership.user_id) ?? []
    list.push(store)
    membershipsByUserId.set(membership.user_id, list)
  }

  return NextResponse.json({
    users: typedUsers.map((profile) => ({
      ...profile,
      stores: (membershipsByUserId.get(profile.id) ?? []).map((store) => ({
        id: store.id,
        name: store.name,
        marketplace: store.marketplace,
      })),
    })),
    stores: typedStores.map((store) => {
      const owner = ownerById.get(store.user_id)
      return {
        id: store.id,
        name: store.name,
        marketplace: store.marketplace,
        owner_id: store.user_id,
        owner_email: owner?.email ?? null,
        owner_name: owner?.full_name ?? null,
      }
    }),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null) as {
    email?: string
    password?: string
    fullName?: string | null
    isPaid?: boolean
    storeIds?: string[]
  } | null

  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''
  const fullName = body?.fullName?.trim() || null
  const isPaid = body?.isPaid ?? false
  const storeIds = Array.from(new Set((body?.storeIds ?? []).map((id) => id.trim()).filter(Boolean)))

  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
  }

  if (storeIds.length === 0) {
    return NextResponse.json({ error: 'Pilih minimal satu toko' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data: stores, error: storesError } = await service
    .from('stores')
    .select('id,name,marketplace')
    .in('id', storeIds)

  if (storesError) {
    return NextResponse.json({ error: storesError.message }, { status: 500 })
  }

  if ((stores ?? []).length !== storeIds.length) {
    return NextResponse.json({ error: 'Sebagian toko tidak ditemukan' }, { status: 400 })
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
          is_paid: isPaid,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      throw profileError
    }

    const memberships = storeIds.map((storeId) => ({
      store_id: storeId,
      user_id: createdUserId,
      role: 'member' as const,
    }))

    const { error: membershipError } = await service
      .from('store_memberships')
      .upsert(memberships, { onConflict: 'store_id,user_id' })

    if (membershipError) {
      throw membershipError
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createdUserId,
        email,
        full_name: fullName,
        is_paid: isPaid,
        stores,
      },
    })
  } catch (error) {
    await service.auth.admin.deleteUser(createdUserId)
    const message = getErrorMessage(error, 'Gagal menyimpan user baru')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
