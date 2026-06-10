import type { LocalUser } from '@/lib/postgres/auth'
import type { AppUserRole, SubscriptionPlan, SubscriptionStatus, SubscriptionTier } from '@/types'

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
  subscription_plan: string | null
  subscription_expires_at: string | null
  trial_ends_at: string | null
}

const DAY_MS = 1000 * 60 * 60 * 24
function daysFromNow(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((new Date(iso).getTime() - Date.now()) / DAY_MS)
}

export type CurrentUserAccess = {
  user: LocalUser
  profile: ProfileRoleRow | null
  role: AppUserRole
  isPrivileged: boolean
  isSuperadmin: boolean
  isManagedAccount: boolean
  isPaid: boolean
  subscription: SubscriptionStatus
  hasInventoryAccess: boolean  // true jika boleh akses modul Pro (pembelian/produksi/stok)
  canUpload: boolean           // true jika boleh upload data baru (akun aktif)
  isReadOnly: boolean          // true jika akses habis → analitik read-only
}

export function resolveSubscription(profile: ProfileRoleRow | null, isPrivileged: boolean): SubscriptionStatus {
  if (isPrivileged) {
    // superadmin selalu punya akses penuh (Pro, tanpa expiry)
    return {
      plan: 'lifetime', tier: 'pro', isActive: true, isTrial: false, isReadOnly: false,
      hasProInventory: true, expiresAt: null, daysRemaining: null,
      trialEndsAt: null, trialDaysRemaining: null,
    }
  }

  const plan = (profile?.subscription_plan ?? null) as SubscriptionPlan
  const expiresAt = profile?.subscription_expires_at ?? null
  const trialEndsAt = profile?.trial_ends_at ?? null
  const now = Date.now()

  // Tier efektif dari plan (legacy lifetime/monthly dianggap Pro).
  const tier: SubscriptionTier =
    plan === 'pro' || plan === 'monthly' || plan === 'lifetime' ? 'pro'
    : plan === 'basic' ? 'basic'
    : null

  // Berlangganan berbayar aktif?
  const paidActive =
    plan === 'lifetime' ? true
    : tier !== null && !!expiresAt ? new Date(expiresAt).getTime() > now
    : false

  // Trial aktif (hanya kalau belum/tidak ada paket berbayar aktif).
  const trialActive = !paidActive && !!trialEndsAt && new Date(trialEndsAt).getTime() > now

  const isActive = paidActive || trialActive
  // Akses modul Pro hanya untuk paket Pro berbayar yang aktif (trial = Basic).
  const hasProInventory = tier === 'pro' && paidActive

  return {
    plan: plan ?? 'free',
    tier: paidActive ? tier : trialActive ? 'basic' : tier,
    isActive,
    isTrial: trialActive,
    isReadOnly: !isActive,
    hasProInventory,
    expiresAt: paidActive ? expiresAt : null,
    daysRemaining: paidActive ? daysFromNow(expiresAt) : null,
    trialEndsAt: trialActive ? trialEndsAt : null,
    trialDaysRemaining: trialActive ? daysFromNow(trialEndsAt) : null,
  }
}

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function isSuperadminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === SUPERADMIN_EMAIL
}

export function isAppUserRole(role: string | null | undefined): role is AppUserRole {
  return role === 'superadmin' || role === 'member'
}

export function resolveUserRole(
  role: string | null | undefined,
  email: string | null | undefined
): AppUserRole {
  if (isAppUserRole(role)) {
    return role
  }

  // role lama 'admin' → downgrade ke member (role admin dihapus)
  if (role === 'admin') {
    return 'member'
  }

  if (isSuperadminEmail(email)) {
    return 'superadmin'
  }

  return 'member'
}

export function isPrivilegedRole(role: AppUserRole) {
  return role === 'superadmin'
}

export function getManagedRole(role: AppUserRole): AppUserRole | null {
  if (role === 'superadmin') {
    return 'member'
  }
  return null
}

export function canCreateStore(role: AppUserRole) {
  // Member boleh membuat toko sendiri (jadi pemilik/owner toko itu).
  // Superadmin juga bisa. Store di-scope per user_id lewat RLS.
  return role === 'superadmin' || role === 'member'
}

export async function getCurrentUserAccess(
  supabase: {
    auth: { getUser: () => Promise<{ data: { user: LocalUser | null } }> }
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          maybeSingle: () => PromiseLike<{ data: unknown | null }>
        }
      }
    }
  }
): Promise<CurrentUserAccess | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,is_paid,role,created_by_id,subscription_plan,subscription_expires_at,trial_ends_at')
    .eq('id', user.id)
    .maybeSingle()

  const typedProfile = (profile ?? null) as ProfileRoleRow | null
  const role = resolveUserRole(typedProfile?.role, user.email)
  const isManagedAccount = Boolean(typedProfile?.created_by_id)
  const isPrivileged = isPrivilegedRole(role)
  const subscription = resolveSubscription(typedProfile, isPrivileged)

  return {
    user,
    profile: typedProfile,
    role,
    isPrivileged,
    isSuperadmin: role === 'superadmin',
    isManagedAccount,
    // Basic/Pro & trial dapat akses dashboard. isPaid dipertahankan true agar
    // gating lama (yang berbasis is_paid) tidak menutup fitur Basic.
    isPaid: true,
    subscription,
    hasInventoryAccess: isPrivileged || subscription.hasProInventory,
    canUpload: isPrivileged || subscription.isActive,
    isReadOnly: !isPrivileged && subscription.isReadOnly,
  }
}
