import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, has_set_password')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ exists: false, hasSetPassword: false })
    }

    return NextResponse.json({
      exists: true,
      hasSetPassword: profile.has_set_password ?? false,
    })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
