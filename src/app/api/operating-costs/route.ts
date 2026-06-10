import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

const VALID_CATEGORIES = [
  'utilities', 'rent', 'salary', 'internet', 'marketing', 'transport', 'supplies', 'other',
]

function parseAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// GET /api/operating-costs?year=&month=&store=
// List biaya operasional milik user. Filter opsional per periode & toko.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const store = searchParams.get('store')

  let query = supabase
    .from('operating_costs')
    .select('id,user_id,store_id,name,category,amount,period_year,period_month,notes,created_at,updated_at')
    .eq('user_id', access.user.id)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: true })

  if (year) query = query.eq('period_year', Number(year))
  if (month) query = query.eq('period_month', Number(month))
  // Scope toko: tampilkan biaya bisnis-wide (store_id null) + biaya toko terpilih.
  if (store) query = query.or(`store_id.is.null,store_id.eq.${store}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ costs: data ?? [] })
}

// POST /api/operating-costs — tambah satu biaya
export async function POST(request: NextRequest) {
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

  if (!body?.name?.trim()) return NextResponse.json({ error: 'Nama biaya wajib diisi' }, { status: 400 })
  const year = Number(body.period_year)
  const month = Number(body.period_month)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Tahun tidak valid' }, { status: 400 })
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Bulan tidak valid' }, { status: 400 })
  }
  const category = VALID_CATEGORIES.includes(body.category ?? '') ? body.category! : 'other'

  const { data, error } = await supabase
    .from('operating_costs')
    .insert({
      user_id: access.user.id,
      store_id: body.store_id ?? null,
      name: body.name.trim(),
      category,
      amount: parseAmount(body.amount),
      period_year: year,
      period_month: month,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cost: data }, { status: 201 })
}
