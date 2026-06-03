import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, destroySession } from '@/lib/postgres/auth'

export async function POST(request: NextRequest) {
  await destroySession(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
