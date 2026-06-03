import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, createSession, signInWithPassword } from '@/lib/postgres/auth'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null
  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 })
  }

  try {
    const user = await signInWithPassword(email, password)
    const session = await createSession(user.id)
    const response = NextResponse.json({ user })

    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: session.expiresAt,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid login credentials' },
      { status: 401 }
    )
  }
}
