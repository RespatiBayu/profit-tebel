import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Cek apakah email terdaftar dan belum set password
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, has_set_password')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Email tidak terdaftar' }, { status: 404 })
    }
    if (profile.has_set_password) {
      return NextResponse.json({ error: 'Password sudah pernah diatur. Gunakan fitur lupa password.' }, { status: 400 })
    }

    // Update password via admin SDK
    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
      password,
    })
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Tandai sudah set password
    await supabase
      .from('profiles')
      .update({ has_set_password: true })
      .eq('id', profile.id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
