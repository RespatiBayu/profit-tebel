import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

const VALID_CATEGORIES = [
  'utilities', 'rent', 'salary', 'internet', 'marketing', 'transport', 'supplies', 'other',
]

// PATCH /api/operating-costs/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    name?: string
    category?: string
    amount?: number
    period_year?: number
    period_month?: number
    store_id?: string | null
    notes?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Nama biaya wajib diisi' }, { status: 400 })
    patch.name = body.name.trim()
  }
  if (body.category !== undefined) {
    patch.category = VALID_CATEGORIES.includes(body.category) ? body.category : 'other'
  }
  if (body.amount !== undefined) patch.amount = Math.max(0, Number(body.amount) || 0)
  if (body.period_year !== undefined) {
    const y = Number(body.period_year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return NextResponse.json({ error: 'Tahun tidak valid' }, { status: 400 })
    patch.period_year = y
  }
  if (body.period_month !== undefined) {
    const m = Number(body.period_month)
    if (!Number.isInteger(m) || m < 1 || m > 12) return NextResponse.json({ error: 'Bulan tidak valid' }, { status: 400 })
    patch.period_month = m
  }
  if (body.store_id !== undefined) patch.store_id = body.store_id ?? null
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tidak ada field yang diupdate' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('operating_costs')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cost: data })
}

// DELETE /api/operating-costs/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('operating_costs')
    .delete()
    .eq('id', params.id)
    .eq('user_id', access.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
