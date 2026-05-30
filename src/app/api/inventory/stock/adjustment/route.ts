import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// POST /api/inventory/stock/adjustment
// Body: { item_id, qty, notes?, date? }
export async function POST(request: Request) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { item_id, qty, notes, date } = body

  if (!item_id) return NextResponse.json({ error: 'item_id wajib diisi' }, { status: 400 })
  if (qty === undefined || qty === null || qty === 0) {
    return NextResponse.json({ error: 'qty tidak boleh 0' }, { status: 400 })
  }

  // Verify item belongs to user
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', item_id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })

  const { data, error } = await supabase
    .from('inventory_transactions')
    .insert({
      user_id: access.user.id,
      item_id,
      transaction_type: 'adjustment',
      qty: Number(qty),
      unit_cost: null,
      date: date ?? new Date().toISOString().slice(0, 10),
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
