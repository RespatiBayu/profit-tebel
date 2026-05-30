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
  subscription_plan: string | null
  subscription_expires_at: string | null
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
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}

export async function GET() {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const service = await createServiceClient()

  // Superadmin: lihat SEMUA user (kecuali sesama superadmin)
  const { data: users, error: usersError } = await service
    .from('profiles')
    .select('id,email,full_name,role,created_at,created_by_id,subscription_plan,subscription_expires_at')
    .neq('role', 'superadmin')
    .order('created_at', { ascending: false })

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  return NextResponse.json({
    actorRole: auth.access.role,
    managedRole: auth.managedRole,
    users: (users ?? []) as ManagedUserRow[],
    stores: [],
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => null) as {
    email?: string
    password?: string
    fullName?: string | null
  } | null

  const email    = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''
  const fullName = body?.fullName?.trim() || null

  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
  }

  const service = await createServiceClient()

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
          has_set_password: false,
        },
        { onConflict: 'id' }
      )

    if (profileError) throw profileError

    return NextResponse.json({
      success: true,
      user: { id: createdUserId, email, full_name: fullName, role: auth.managedRole },
    })
  } catch (error) {
    await service.auth.admin.deleteUser(createdUserId)
    const message = getErrorMessage(error, 'Gagal menyimpan user baru')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
