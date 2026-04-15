import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ stores: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const marketplace = (body.marketplace as string | undefined) ?? 'shopee'
  const color = (body.color as string | undefined) ?? null
  const notes = (body.notes as string | undefined) ?? null

  if (!name) {
    return NextResponse.json({ error: 'Nama toko wajib diisi' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('stores')
    .insert({ user_id: user.id, name, marketplace, color, notes })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Toko "${name}" sudah ada untuk marketplace ${marketplace}` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ store: data })
}
