import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/stock
// Returns items joined with item_stock view
export async function GET(request: Request) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')   // item type filter
  const q    = searchParams.get('q')      // name search

  let query = supabase
    .from('items')
    .select('id, name, sku, type, unit, cost_per_unit, notes')
    .eq('user_id', access.user.id)
    .order('name')

  if (type) query = query.eq('type', type)
  if (q)    query = query.ilike('name', `%${q}%`)

  const { data: items, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!items || items.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Fetch item_stock for all items belonging to user
  const { data: stocks } = await supabase
    .from('item_stock')
    .select('item_id, qty_on_hand, avg_cost, last_transaction_date, transaction_count')
    .eq('user_id', access.user.id)

  const stockMap = new Map((stocks ?? []).map((s) => [s.item_id, s]))

  const data = items.map((item) => {
    const stock = stockMap.get(item.id)
    return {
      ...item,
      qty_on_hand: stock?.qty_on_hand ?? 0,
      avg_cost: stock?.avg_cost ?? null,
      last_transaction_date: stock?.last_transaction_date ?? null,
      transaction_count: stock?.transaction_count ?? 0,
    }
  })

  return NextResponse.json({ data })
}
