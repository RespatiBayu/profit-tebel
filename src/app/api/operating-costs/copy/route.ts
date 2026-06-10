import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// POST /api/operating-costs/copy
// Salin semua biaya dari satu periode (from_year/from_month) ke periode lain
// (to_year/to_month). Dipakai tombol "Salin dari bulan lalu".
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    from_year?: number
    from_month?: number
    to_year?: number
    to_month?: number
  } | null

  const fy = Number(body?.from_year), fm = Number(body?.from_month)
  const ty = Number(body?.to_year), tm = Number(body?.to_month)
  if (![fy, fm, ty, tm].every(Number.isInteger) || fm < 1 || fm > 12 || tm < 1 || tm > 12) {
    return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 })
  }
  if (fy === ty && fm === tm) {
    return NextResponse.json({ error: 'Periode asal & tujuan sama' }, { status: 400 })
  }

  const { data: source, error: srcErr } = await supabase
    .from('operating_costs')
    .select('store_id,name,category,amount,notes')
    .eq('user_id', access.user.id)
    .eq('period_year', fy)
    .eq('period_month', fm)
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })

  if (!source || source.length === 0) {
    return NextResponse.json({ error: 'Tidak ada biaya di bulan asal untuk disalin' }, { status: 400 })
  }

  const rows = source.map((c) => ({
    user_id: access.user.id,
    store_id: c.store_id ?? null,
    name: c.name,
    category: c.category,
    amount: c.amount,
    period_year: ty,
    period_month: tm,
    notes: c.notes ?? null,
  }))

  const { error: insErr } = await supabase.from('operating_costs').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, copied: rows.length })
}
