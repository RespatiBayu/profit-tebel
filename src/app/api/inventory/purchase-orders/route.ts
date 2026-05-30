import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/purchase-orders?status=draft
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim()

  let query = supabase
    .from('purchase_orders')
    .select(`
      id, po_number, date, supplier, status, notes, total_amount, created_at, updated_at,
      purchase_order_lines(id, item_id, qty_ordered, qty_received, unit_cost,
        item:items!item_id(id, name, unit, type))
    `)
    .eq('user_id', access.user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data: pos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let result = pos ?? []
  if (q) {
    const ql = q.toLowerCase()
    result = result.filter((po) =>
      (po.po_number ?? '').toLowerCase().includes(ql) ||
      (po.supplier ?? '').toLowerCase().includes(ql)
    )
  }

  // Map lines with total_cost
  const mapped = result.map((po) => ({
    ...po,
    purchase_order_lines: ((po.purchase_order_lines as unknown) as Array<{
      id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number;
      item: { id: string; name: string; unit: string; type: string } | null
    }> ?? []).map((l) => ({
      ...l,
      total_cost: l.qty_ordered * l.unit_cost,
    })),
  }))

  return NextResponse.json({ purchase_orders: mapped })
}

// POST /api/inventory/purchase-orders
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    date: string
    supplier?: string | null
    po_number?: string | null
    notes?: string | null
    store_id?: string | null
    lines: Array<{ item_id: string; qty_ordered: number; unit_cost: number }>
  }

  if (!body.date) return NextResponse.json({ error: 'Tanggal wajib diisi' }, { status: 400 })
  if (!body.lines?.length) return NextResponse.json({ error: 'PO harus memiliki minimal 1 item' }, { status: 400 })
  if (body.lines.some((l) => !l.item_id || l.qty_ordered <= 0 || l.unit_cost < 0)) {
    return NextResponse.json({ error: 'Semua baris harus memiliki item, qty > 0, dan harga >= 0' }, { status: 400 })
  }

  // Auto-generate po_number jika kosong
  let poNumber = body.po_number?.trim() || null
  if (!poNumber) {
    const yyyymm = body.date.slice(0, 7).replace('-', '')
    const { count } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', access.user.id)
    poNumber = `PO-${yyyymm}-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      user_id: access.user.id,
      store_id: body.store_id ?? null,
      po_number: poNumber,
      date: body.date,
      supplier: body.supplier?.trim() || null,
      notes: body.notes?.trim() || null,
      status: 'draft',
    })
    .select()
    .single()
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 })

  const lineInserts = body.lines.map((l) => ({
    po_id: po.id,
    item_id: l.item_id,
    qty_ordered: l.qty_ordered,
    unit_cost: l.unit_cost,
  }))
  const { error: lErr } = await supabase.from('purchase_order_lines').insert(lineInserts)
  if (lErr) {
    await supabase.from('purchase_orders').delete().eq('id', po.id)
    return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  return NextResponse.json({ purchase_order: po }, { status: 201 })
}
