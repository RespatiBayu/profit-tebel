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
    .select('store_id,name,category,amount,cost_date,notes')
    .eq('user_id', access.user.id)
    .eq('period_year', fy)
    .eq('period_month', fm)
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })

  if (!source || source.length === 0) {
    return NextResponse.json({ error: 'Tidak ada biaya di bulan asal untuk disalin' }, { status: 400 })
  }

  // Berapa hari di bulan tujuan (untuk clamp tanggal mis. 31 -> 30).
  const daysInTarget = new Date(ty, tm, 0).getDate()

  const rows = source.map((c) => {
    // Pertahankan tanggal (hari) dari biaya asal, pindahkan ke bulan tujuan.
    const srcDay = typeof c.cost_date === 'string' ? Number(c.cost_date.slice(8, 10)) || 1 : 1
    const day = Math.min(srcDay, daysInTarget)
    const costDate = `${ty}-${String(tm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return {
      user_id: access.user.id,
      store_id: c.store_id ?? null,
      name: c.name,
      category: c.category,
      amount: c.amount,
      cost_date: costDate,
      period_year: ty,
      period_month: tm,
      notes: c.notes ?? null,
    }
  })

  const { error: insErr } = await supabase.from('operating_costs').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, copied: rows.length })
}
