import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/low-stock
// Returns items where qty_on_hand <= min_stock_qty (dan min_stock_qty > 0)
export async function GET() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ambil items dengan min_stock_qty > 0
  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, unit, type, sku, min_stock_qty')
    .eq('user_id', access.user.id)
    .gt('min_stock_qty', 0)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ data: [] })

  // Ambil stok terkini
  const itemIds = items.map((i) => i.id)
  const { data: stocks } = await supabase
    .from('item_stock')
    .select('item_id, qty_on_hand')
    .eq('user_id', access.user.id)
    .in('item_id', itemIds)

  const stockMap = new Map((stocks ?? []).map((s) => [s.item_id, Number(s.qty_on_hand) || 0]))

  // Filter yang stoknya <= min_stock_qty
  const lowStock = items
    .map((item) => ({
      id:            item.id,
      name:          item.name,
      unit:          item.unit,
      type:          item.type,
      sku:           item.sku,
      min_stock_qty: Number(item.min_stock_qty),
      qty_on_hand:   stockMap.get(item.id) ?? 0,
    }))
    .filter((item) => item.qty_on_hand <= item.min_stock_qty)
    .sort((a, b) => (a.qty_on_hand / Math.max(a.min_stock_qty, 1)) - (b.qty_on_hand / Math.max(b.min_stock_qty, 1)))

  return NextResponse.json({ data: lowStock })
}
