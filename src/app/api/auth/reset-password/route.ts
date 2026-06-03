import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    ok: true,
    message: 'Reset password dikelola admin karena auth sekarang berjalan lokal di VPS.',
  })
}
