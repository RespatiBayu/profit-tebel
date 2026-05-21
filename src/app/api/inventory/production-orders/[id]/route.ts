import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

// GET /api/inventory/production-orders/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: order, error } = await supabase
    .from('production_orders')
    .select(`
      id, user_id, store_id, po_number, bom_id, status, planned_qty, actual_qty, date, notes,
      total_material_cost, hpp_per_unit, created_at, updated_at, completed_at,
      bom:bom_headers!bom_id(
        id, name, output_qty,
        output_item:items!output_item_id(id, name, unit, type)
      ),
      production_order_lines(id, item_id, planned_qty, actual_qty, unit_cost_snapshot,
        item:items!item_id(id, name, unit, type, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Production Order tidak ditemukan' }, { status: 404 })

  // Ambil avg_cost untuk setiap input item
  const lines = (order.production_order_lines as unknown) as Array<{
    id: string; item_id: string; planned_qty: number; actual_qty: number | null;
    unit_cost_snapshot: number | null;
    item: { id: string; name: string; unit: string; type: string; cost_per_unit: number } | null
  }>

  const itemIds = lines.map((l) => l.item_id)
  const { data: stockData } = itemIds.length > 0
    ? await supabase.from('item_stock').select('item_id, avg_cost').eq('user_id', access.user.id).in('item_id', itemIds)
    : { data: [] }
  const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost as number | null]))

  const enrichedLines = lines.map((l) => ({
    ...l,
    current_stock: null as number | null, // sengaja omit — bisa ditambah nanti
    avg_cost: stockMap.get(l.item_id) ?? null,
  }))

  return NextResponse.json({
    production_order: {
      ...order,
      production_order_lines: enrichedLines,
    },
  })
}

// PATCH /api/inventory/production-orders/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: existing } = await supabase
    .from('production_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Production Order tidak ditemukan' }, { status: 404 })
  if (existing.status === 'completed') return NextResponse.json({ error: 'PO yang sudah selesai tidak bisa diubah' }, { status: 409 })
  if (existing.status === 'cancelled') return NextResponse.json({ error: 'PO yang dibatalkan tidak bisa diubah' }, { status: 409 })

  const body = await request.json() as {
    date?: string
    planned_qty?: number
    po_number?: string | null
    notes?: string | null
    status?: 'draft' | 'in_progress' | 'cancelled'
  }

  const patch: Record<string, unknown> = {}
  if (body.date !== undefined) patch.date = body.date
  if (body.planned_qty !== undefined) patch.planned_qty = body.planned_qty
  if (body.po_number !== undefined) patch.po_number = body.po_number?.trim() || null
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null
  if (body.status !== undefined) patch.status = body.status

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from('production_orders')
      .update(patch)
      .eq('id', params.id)
      .eq('user_id', access.user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/inventory/production-orders/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: order } = await supabase
    .from('production_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Production Order tidak ditemukan' }, { status: 404 })
  if (order.status !== 'draft') {
    return NextResponse.json({ error: 'Hanya Production Order draft yang bisa dihapus.' }, { status: 409 })
  }

  const { error } = await supabase
    .from('production_orders')
    .delete()
    .eq('id', params.id)
    .eq('user_id', access.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
