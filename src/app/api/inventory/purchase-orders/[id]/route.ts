import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

// GET /api/inventory/purchase-orders/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, date, supplier, status, notes, total_amount, created_at, updated_at,
      purchase_order_lines(id, item_id, qty_ordered, qty_received, unit_cost,
        item:items!item_id(id, name, unit, type, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!po) return NextResponse.json({ error: 'PO tidak ditemukan' }, { status: 404 })

  const lines = (po.purchase_order_lines as unknown) as Array<{
    id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number;
    item: { id: string; name: string; unit: string; type: string; cost_per_unit: number } | null
  }>

  return NextResponse.json({
    purchase_order: {
      ...po,
      purchase_order_lines: lines.map((l) => ({ ...l, total_cost: l.qty_ordered * l.unit_cost })),
    },
  })
}

// PATCH /api/inventory/purchase-orders/[id]
// Hanya bisa edit PO yang masih 'draft' atau 'confirmed'
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: existing } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'PO tidak ditemukan' }, { status: 404 })
  if (existing.status === 'received') return NextResponse.json({ error: 'PO yang sudah diterima tidak bisa diubah' }, { status: 409 })
  if (existing.status === 'cancelled') return NextResponse.json({ error: 'PO yang dibatalkan tidak bisa diubah' }, { status: 409 })

  const body = await request.json() as {
    date?: string
    supplier?: string | null
    po_number?: string | null
    notes?: string | null
    status?: 'draft' | 'confirmed' | 'cancelled'
    lines?: Array<{ item_id: string; qty_ordered: number; unit_cost: number }>
  }

  const patch: Record<string, unknown> = {}
  if (body.date !== undefined) patch.date = body.date
  if (body.supplier !== undefined) patch.supplier = body.supplier?.trim() || null
  if (body.po_number !== undefined) patch.po_number = body.po_number?.trim() || null
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null
  if (body.status !== undefined) patch.status = body.status

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from('purchase_orders')
      .update(patch)
      .eq('id', params.id)
      .eq('user_id', access.user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace lines jika dikirim
  if (body.lines !== undefined) {
    if (!body.lines.length) return NextResponse.json({ error: 'PO harus memiliki minimal 1 item' }, { status: 400 })
    if (body.lines.some((l) => !l.item_id || l.qty_ordered <= 0 || l.unit_cost < 0)) {
      return NextResponse.json({ error: 'Semua baris harus valid' }, { status: 400 })
    }
    await supabase.from('purchase_order_lines').delete().eq('po_id', params.id)
    const lineInserts = body.lines.map((l) => ({
      po_id: params.id,
      item_id: l.item_id,
      qty_ordered: l.qty_ordered,
      unit_cost: l.unit_cost,
    }))
    const { error: lErr } = await supabase.from('purchase_order_lines').insert(lineInserts)
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/inventory/purchase-orders/[id]
// Hanya bisa hapus PO draft
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!po) return NextResponse.json({ error: 'PO tidak ditemukan' }, { status: 404 })
  if (po.status !== 'draft') {
    return NextResponse.json({ error: 'Hanya PO draft yang bisa dihapus. Batalkan terlebih dahulu.' }, { status: 409 })
  }

  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', params.id)
    .eq('user_id', access.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
