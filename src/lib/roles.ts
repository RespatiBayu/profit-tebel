import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AppUserRole } from '@/types'

const SUPERADMIN_EMAIL = (
  process.env.SUPERADMIN_EMAIL ?? 'profittebel.admin@gmail.com'
).trim().toLowerCase()

type ProfileRoleRow = {
  id: string
  email: string | null
  full_name: string | null
  is_paid: boolean | null
  role: string | null
  created_by_id: string | null
}

export type CurrentUserAccess = {
  user: User
  profile: ProfileRoleRow | null
  role: AppUserRole
  isPrivileged: boolean
  isSuperadmin: boolean
  isManagedAccount: boolean
  isPaid: boolean
}

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function isSuperadminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === SUPERADMIN_EMAIL
}

export function isAppUserRole(role: string | null | undefined): role is AppUserRole {
  return role === 'superadmin' || role === 'admin' || role === 'member'
}

export function resolveUserRole(
  role: string | null | undefined,
  email: string | null | undefined
): AppUserRole {
  if (isAppUserRole(role)) {
    return role
  }

  if (isSuperadminEmail(email)) {
    return 'superadmin'
  }

  return 'member'
}

export function isPrivilegedRole(role: AppUserRole) {
  return role === 'superadmin' || role === 'admin'
}

export function getManagedRole(role: AppUserRole): AppUserRole | null {
  if (role === 'superadmin') {
    return 'admin'
  }

  if (role === 'admin') {
    return 'member'
  }

  return null
}

export function canCreateStore(role: AppUserRole) {
  return role !== 'member'
}

export async function getCurrentUserAccess(
  supabase: SupabaseClient
): Promise<CurrentUserAccess | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,is_paid,role,created_by_id')
    .eq('id', user.id)
    .maybeSingle()

  const typedProfile = (profile ?? null) as ProfileRoleRow | null
  const role = resolveUserRole(typedProfile?.role, user.email)
  const isManagedAccount = Boolean(typedProfile?.created_by_id)

  return {
    user,
    profile: typedProfile,
    role,
    isPrivileged: isPrivilegedRole(role),
    isSuperadmin: role === 'superadmin',
    isManagedAccount,
    isPaid: isPrivilegedRole(role) || isManagedAccount || (typedProfile?.is_paid ?? false),
  }
}
