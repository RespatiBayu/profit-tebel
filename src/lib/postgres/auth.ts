import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { query } from './db'

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'pt_session'
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14)

export type LocalUser = {
  id: string
  email: string
  user_metadata?: {
    full_name?: string | null
  }
}

type AuthUserRow = {
  id: string
  email: string
  password_hash: string
  full_name: string | null
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex')
  return `pbkdf2_sha256$${salt}$${hash}`
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, expected] = storedHash.split('$')
  if (scheme !== 'pbkdf2_sha256' || !salt || !expected) return false

  const actual = hashPassword(password, salt).split('$')[2]
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function toUser(row: { id: string; email: string; full_name?: string | null }): LocalUser {
  return {
    id: row.id,
    email: row.email,
    user_metadata: {
      full_name: row.full_name ?? null,
    },
  }
}

export function newPasswordHash(password: string) {
  return hashPassword(password)
}

export async function createAuthUser(params: {
  email: string
  password: string
  fullName?: string | null
  role?: string
  createdById?: string | null
}) {
  const email = params.email.trim().toLowerCase()
  const id = crypto.randomUUID()
  const passwordHash = hashPassword(params.password)
  const fullName = params.fullName ?? email.split('@')[0] ?? null

  const { rows } = await query<AuthUserRow>(
    `
      insert into auth_users (id, email, password_hash, full_name)
      values ($1, $2, $3, $4)
      returning id, email, password_hash, full_name
    `,
    [id, email, passwordHash, fullName]
  )

  // User baru dapat free trial Basic 14 hari sejak pendaftaran.
  await query(
    `
      insert into profiles (id, email, full_name, is_paid, role, created_by_id, trial_ends_at)
      values ($1, $2, $3, false, $4, $5, now() + interval '14 days')
      on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(profiles.full_name, excluded.full_name),
          role = coalesce(profiles.role, excluded.role),
          created_by_id = coalesce(profiles.created_by_id, excluded.created_by_id),
          trial_ends_at = coalesce(profiles.trial_ends_at, excluded.trial_ends_at)
    `,
    [id, email, fullName, params.role ?? 'member', params.createdById ?? null]
  )

  return toUser(rows[0])
}

export async function updateAuthUser(
  id: string,
  payload: { email?: string; password?: string; user_metadata?: { full_name?: string | null } }
) {
  const updates: string[] = []
  const values: unknown[] = []

  if (payload.email) {
    values.push(payload.email.trim().toLowerCase())
    updates.push(`email = $${values.length}`)
  }

  if (payload.password) {
    values.push(hashPassword(payload.password))
    updates.push(`password_hash = $${values.length}`)
  }

  if (payload.user_metadata && 'full_name' in payload.user_metadata) {
    values.push(payload.user_metadata.full_name ?? null)
    updates.push(`full_name = $${values.length}`)
  }

  if (updates.length === 0) {
    const { rows } = await query<{ id: string; email: string; full_name: string | null }>(
      'select id, email, full_name from auth_users where id = $1',
      [id]
    )
    return rows[0] ? toUser(rows[0]) : null
  }

  values.push(id)
  const { rows } = await query<{ id: string; email: string; full_name: string | null }>(
    `update auth_users set ${updates.join(', ')}, updated_at = now() where id = $${values.length} returning id, email, full_name`,
    values
  )

  if (rows[0]) {
    await query('update profiles set email = $1, full_name = $2 where id = $3', [
      rows[0].email,
      rows[0].full_name,
      rows[0].id,
    ])
  }

  return rows[0] ? toUser(rows[0]) : null
}

export async function deleteAuthUser(id: string) {
  await query('delete from auth_users where id = $1', [id])
}

export async function signInWithPassword(email: string, password: string) {
  const { rows } = await query<AuthUserRow>(
    'select id, email, password_hash, full_name from auth_users where lower(email) = lower($1)',
    [email]
  )
  const row = rows[0]

  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error('Invalid login credentials')
  }

  await query(
    `
      insert into profiles (id, email, full_name, is_paid, role)
      values ($1, $2, $3, false, case when lower($2) = lower($4) then 'superadmin' else 'member' end)
      on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(profiles.full_name, excluded.full_name)
    `,
    [row.id, row.email, row.full_name ?? row.email.split('@')[0], process.env.SUPERADMIN_EMAIL ?? 'profittebel.admin@gmail.com']
  )

  return toUser(row)
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  await query(
    'insert into auth_sessions (token, user_id, expires_at) values ($1, $2, $3)',
    [token, userId, expiresAt.toISOString()]
  )

  return { token, expiresAt }
}

export async function destroySession(token: string | undefined) {
  if (!token) return
  await query('delete from auth_sessions where token = $1', [token])
}

export async function getUserFromSessionToken(token: string | undefined): Promise<LocalUser | null> {
  if (!token) return null

  const { rows } = await query<{ id: string; email: string; full_name: string | null }>(
    `
      select au.id, au.email, au.full_name
      from auth_sessions s
      join auth_users au on au.id = s.user_id
      where s.token = $1 and s.expires_at > now()
    `,
    [token]
  )

  return rows[0] ? toUser(rows[0]) : null
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  return getUserFromSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)
}
