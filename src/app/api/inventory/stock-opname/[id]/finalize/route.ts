import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

// POST /api/inventory/stock-opname/[id]/finalize
// Finalisasi opname: buat inventory_transactions (adjustment) untuk semua item yg ada selisih
export async function POST(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load session
  const { data: session } = await supabase
    .from('stock_opname_sessions')
    .select('id, status, date, store_id, name')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
  if (session.status === 'finalized') {
    return NextResponse.json({ error: 'Sesi sudah difinalisasi sebelumnya' }, { status: 409 })
  }

  // Load lines
  const { data: lines, error: linesError } = await supabase
    .from('stock_opname_lines')
    .select('id, item_id, system_qty, actual_qty')
    .eq('session_id', params.id)

  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })

  type LineRow = { id: string; item_id: string; system_qty: number; actual_qty: number | null }
  const typedLines = (lines ?? []) as LineRow[]

  // Filter hanya baris dengan actual_qty terisi dan ada selisih
  const withDiff = typedLines.filter(
    (l) => l.actual_qty != null && Number(l.actual_qty) !== Number(l.system_qty)
  )

  let adjustmentCount = 0

  if (withDiff.length > 0) {
    const txDate = session.date as string

    const txRows = withDiff.map((l) => ({
      user_id:          access.user.id,
      store_id:         session.store_id ?? null,
      item_id:          l.item_id,
      transaction_type: 'adjustment' as const,
      reference_id:     session.id,
      reference_type:   'stock_opname',
      qty:              Number(l.actual_qty) - Number(l.system_qty),  // selisih (bisa ± )
      unit_cost:        null,
      date:             txDate,
      notes:            `Stock opname: ${session.name}`,
    }))

    const CHUNK = 200
    for (let i = 0; i < txRows.length; i += CHUNK) {
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert(txRows.slice(i, i + CHUNK))
      if (txError) {
        return NextResponse.json({ error: `Gagal membuat transaksi: ${txError.message}` }, { status: 500 })
      }
      adjustmentCount += txRows.slice(i, i + CHUNK).length
    }
  }

  // Finalize session
  const { error: updateError } = await supabase
    .from('stock_opname_sessions')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', params.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    data: {
      adjustmentCount,
      totalLines:     typedLines.length,
      skippedLines:   typedLines.length - withDiff.length,
    },
  })
}
