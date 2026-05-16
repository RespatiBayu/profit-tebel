import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserAccess, getManagedRole } from '@/lib/roles'
import type { AppUserRole } from '@/types'

type ManagedUserRow = {
  id: string
  email: string | null
  full_name: string | null
  role: AppUserRole
  created_by_id: string | null
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

async function getManagedUser(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  actorId: string,
  managedRole: AppUserRole,
  userId: string
) {
  const { data, error } = await service
    .from('profiles')
    .select('id,email,full_name,role,created_by_id')
    .eq('id', userId)
    .eq('created_by_id', actorId)
    .eq('role', managedRole)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data ?? null) as ManagedUserRow | null
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireManager()
  if (auth.error) return auth.error

  const service = await createServiceClient()
  const managedUser = await getManagedUser(
    service,
    auth.access.user.id,
    auth.managedRole,
    id
  )

  if (!managedUser) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
  }

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
    new Set((body?.storeIds ?? []).map((storeId) => storeId.trim()).filter(Boolean))
  )

  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }

  if (password && password.length < 8) {
    return NextResponse.json(
      { error: 'Password minimal 8 karakter jika ingin diubah' },
      { status: 400 }
    )
  }

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

  const updatePayload: {
    email?: string
    email_confirm?: boolean
    password?: string
    user_metadata?: { full_name: string | null }
  } = {
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  }

  if (password) {
    updatePayload.password = password
  }

  const { error: authUpdateError } = await service.auth.admin.updateUserById(
    managedUser.id,
    updatePayload
  )

  if (authUpdateError) {
    return NextResponse.json({ error: authUpdateError.message }, { status: 400 })
  }

  try {
    const { error: profileError } = await service
      .from('profiles')
      .update({
        email,
        full_name: fullName,
      })
      .eq('id', managedUser.id)

    if (profileError) {
      throw profileError
    }

    if (auth.managedRole === 'member') {
      const { data: actorStores, error: actorStoresError } = await service
        .from('stores')
        .select('id')
        .eq('user_id', auth.access.user.id)

      if (actorStoresError) {
        throw actorStoresError
      }

      const actorStoreIds = (actorStores ?? []).map((store) => store.id)

      if (actorStoreIds.length > 0) {
        const { error: deleteMembershipError } = await service
          .from('store_memberships')
          .delete()
          .eq('user_id', managedUser.id)
          .in('store_id', actorStoreIds)

        if (deleteMembershipError) {
          throw deleteMembershipError
        }
      }

      if (selectedStores.length > 0) {
        const memberships = selectedStores.map((store) => ({
          store_id: store.id,
          user_id: managedUser.id,
          role: 'member' as const,
        }))

        const { error: membershipError } = await service
          .from('store_memberships')
          .upsert(memberships, { onConflict: 'store_id,user_id' })

        if (membershipError) {
          throw membershipError
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: managedUser.id,
        email,
        full_name: fullName,
        role: managedUser.role,
        stores: selectedStores,
      },
    })
  } catch (error) {
    const message = getErrorMessage(error, 'Gagal memperbarui user')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireManager()
  if (auth.error) return auth.error

  const service = await createServiceClient()
  const managedUser = await getManagedUser(
    service,
    auth.access.user.id,
    auth.managedRole,
    id
  )

  if (!managedUser) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
  }

  const { error } = await service.auth.admin.deleteUser(managedUser.id)

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message.includes('violates foreign key constraint')
            ? 'User ini masih memiliki akun turunan atau data terkait yang harus dibereskan dulu.'
            : error.message,
      },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
