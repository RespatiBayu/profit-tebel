import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/dashboard-summary
// Quick stats for main dashboard widget
export async function GET() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ data: null })
  }

  const userId = access.user.id

  // Run all queries in parallel
  const [itemsRes, stockRes, poRes, prodRes] = await Promise.all([
    supabase
      .from('items')
      .select('id, min_stock_qty')
      .eq('user_id', userId),

    supabase
      .from('item_stock')
      .select('item_id, qty_on_hand, avg_cost')
      .eq('user_id', userId),

    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['draft', 'confirmed']),

    supabase
      .from('production_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['draft', 'in_progress']),
  ])

  const items  = itemsRes.data ?? []
  const stocks = stockRes.data ?? []

  const stockMap = new Map(stocks.map((s) => [
    s.item_id,
    { qty: Number(s.qty_on_hand) || 0, avgCost: Number(s.avg_cost) || 0 },
  ]))

  // Total nilai stok = SUM(qty_on_hand × avg_cost) untuk item yang punya keduanya
  let totalStockValue = 0
  for (const s of stocks) {
    if (s.qty_on_hand > 0 && s.avg_cost != null) {
      totalStockValue += Number(s.qty_on_hand) * Number(s.avg_cost)
    }
  }

  // Low stock: items dengan min_stock_qty > 0 dan qty_on_hand <= min_stock_qty
  type LowItem = { id: string; name?: string; unit?: string; qty_on_hand: number; min_stock_qty: number }
  const itemMinMap = new Map(items.map((i) => [i.id, Number(i.min_stock_qty) || 0]))

  // Fetch names for low-stock items
  const lowStockIds = items
    .filter((i) => {
      const min = Number(i.min_stock_qty) || 0
      if (min <= 0) return false
      const qty = stockMap.get(i.id)?.qty ?? 0
      return qty <= min
    })
    .map((i) => i.id)

  let lowStockItems: LowItem[] = []
  if (lowStockIds.length > 0) {
    const { data: lowItemDetails } = await supabase
      .from('items')
      .select('id, name, unit')
      .in('id', lowStockIds)
      .limit(10)

    lowStockItems = (lowItemDetails ?? []).map((item) => ({
      id:            item.id,
      name:          item.name,
      unit:          item.unit,
      qty_on_hand:   stockMap.get(item.id)?.qty ?? 0,
      min_stock_qty: itemMinMap.get(item.id) ?? 0,
    })).sort((a, b) =>
      (a.qty_on_hand / Math.max(a.min_stock_qty, 1)) - (b.qty_on_hand / Math.max(b.min_stock_qty, 1))
    )
  }

  return NextResponse.json({
    data: {
      totalItems:             items.length,
      totalStockValue,
      lowStockCount:          lowStockIds.length,
      zeroStockCount:         lowStockIds.filter((id) => (stockMap.get(id)?.qty ?? 0) <= 0).length,
      pendingPOCount:         poRes.count ?? 0,
      pendingProductionCount: prodRes.count ?? 0,
      lowStockItems:          lowStockItems.slice(0, 5),
    },
  })
}
