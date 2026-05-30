import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/production-orders?status=draft
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('production_orders')
    .select(`
      id, po_number, bom_id, status, planned_qty, actual_qty, date, notes,
      total_material_cost, hpp_per_unit, created_at, updated_at, completed_at,
      bom:bom_headers!bom_id(
        id, name, output_qty,
        output_item:items!output_item_id(id, name, unit, type)
      )
    `)
    .eq('user_id', access.user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ production_orders: data ?? [] })
}

// POST /api/inventory/production-orders
// Buat production order + auto-populate lines dari BOM
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    bom_id: string
    planned_qty: number
    date: string
    po_number?: string | null
    notes?: string | null
    store_id?: string | null
  }

  if (!body.bom_id) return NextResponse.json({ error: 'bom_id wajib diisi' }, { status: 400 })
  if (!body.planned_qty || body.planned_qty <= 0) return NextResponse.json({ error: 'planned_qty harus > 0' }, { status: 400 })
  if (!body.date) return NextResponse.json({ error: 'Tanggal wajib diisi' }, { status: 400 })

  // Validasi BOM milik user + ambil lines
  const { data: bom } = await supabase
    .from('bom_headers')
    .select('id, output_qty, bom_lines(input_item_id, qty_per_output)')
    .eq('id', body.bom_id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!bom) return NextResponse.json({ error: 'BOM tidak ditemukan' }, { status: 404 })

  const bomLines = (bom.bom_lines as Array<{ input_item_id: string; qty_per_output: number }>) ?? []
  if (!bomLines.length) return NextResponse.json({ error: 'BOM tidak memiliki bahan' }, { status: 400 })

  // Auto-generate po_number jika kosong
  let poNumber = body.po_number?.trim() || null
  if (!poNumber) {
    const yyyymm = body.date.slice(0, 7).replace('-', '')
    const { count } = await supabase
      .from('production_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', access.user.id)
    poNumber = `PROD-${yyyymm}-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  // Insert production order
  const { data: prodOrder, error: poErr } = await supabase
    .from('production_orders')
    .insert({
      user_id: access.user.id,
      store_id: body.store_id ?? null,
      bom_id: body.bom_id,
      po_number: poNumber,
      status: 'draft',
      planned_qty: body.planned_qty,
      date: body.date,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 })

  // Insert lines: qty = qty_per_output × (planned_qty / output_qty)
  const multiplier = body.planned_qty / bom.output_qty
  const lineInserts = bomLines.map((l) => ({
    production_order_id: prodOrder.id,
    item_id: l.input_item_id,
    planned_qty: Math.round(l.qty_per_output * multiplier * 10000) / 10000,
  }))
  const { error: lErr } = await supabase.from('production_order_lines').insert(lineInserts)
  if (lErr) {
    await supabase.from('production_orders').delete().eq('id', prodOrder.id)
    return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  return NextResponse.json({ production_order: prodOrder }, { status: 201 })
}
