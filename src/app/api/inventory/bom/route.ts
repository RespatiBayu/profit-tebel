import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { calculateBomHpp } from '@/lib/inventory/bom-calculator'
import type { BomHeaderInput, ItemCostData } from '@/lib/inventory/bom-calculator'
import { syncBomHppToItem } from '@/lib/inventory/sync-bom-hpp'

// GET /api/inventory/bom?store_id=&q=
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')
  const q = searchParams.get('q')?.trim()

  let query = supabase
    .from('bom_headers')
    .select(`
      id, output_item_id, output_qty, name, notes, is_active, created_at, updated_at,
      output_item:items!output_item_id(id, name, type, unit),
      bom_lines(id, input_item_id, qty_per_output, sort_order,
        input_item:items!input_item_id(id, name, type, unit, cost_per_unit))
    `)
    .eq('user_id', access.user.id)
    .order('created_at', { ascending: false })

  if (storeId) query = query.eq('store_id', storeId)

  const { data: boms, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by name jika ada query
  let filtered = boms ?? []
  if (q) {
    const ql = q.toLowerCase()
    filtered = filtered.filter((b) => {
      const outName = (b.output_item as { name?: string } | null)?.name?.toLowerCase() ?? ''
      const bomName = b.name?.toLowerCase() ?? ''
      return outName.includes(ql) || bomName.includes(ql)
    })
  }

  // Hitung HPP untuk setiap BOM
  const allBomInputs: BomHeaderInput[] = filtered.map((b) => ({
    id: b.id,
    output_item_id: b.output_item_id,
    output_qty: b.output_qty,
    lines: (b.bom_lines as Array<{ input_item_id: string; qty_per_output: number }> ?? []).map((l) => ({
      input_item_id: l.input_item_id,
      qty_per_output: l.qty_per_output,
    })),
  }))

  // Kumpulkan semua item cost data
  const allItemIds = new Set<string>()
  filtered.forEach((b) => {
    allItemIds.add(b.output_item_id)
    ;(b.bom_lines as Array<{ input_item_id: string }> ?? []).forEach((l) => allItemIds.add(l.input_item_id))
  })

  const itemCosts: ItemCostData[] = []
  if (allItemIds.size > 0) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, cost_per_unit, type')
      .in('id', Array.from(allItemIds))
      .eq('user_id', access.user.id)

    const { data: stockData } = await supabase
      .from('item_stock')
      .select('item_id, avg_cost')
      .eq('user_id', access.user.id)
      .in('item_id', Array.from(allItemIds))

    const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost]))

    for (const item of itemsData ?? []) {
      itemCosts.push({
        id: item.id,
        cost_per_unit: item.cost_per_unit ?? 0,
        avg_cost: stockMap.get(item.id) ?? null,
        type: item.type,
      })
    }
  }

  const bomMap = new Map(allBomInputs.map((b) => [b.id, b]))
  const itemMap = new Map(itemCosts.map((i) => [i.id, i]))

  const result = filtered.map((b) => {
    const calc = calculateBomHpp(b.id, bomMap, itemMap)
    return {
      ...b,
      hpp_per_unit: calc.hpp_per_unit,
      has_cycle: calc.has_cycle,
      line_count: (b.bom_lines as unknown[])?.length ?? 0,
    }
  })

  return NextResponse.json({ boms: result })
}

// POST /api/inventory/bom
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    output_item_id: string
    output_qty: number
    name?: string | null
    notes?: string | null
    store_id?: string | null
    lines: Array<{ input_item_id: string; qty_per_output: number; sort_order?: number; notes?: string | null }>
  }

  if (!body.output_item_id) return NextResponse.json({ error: 'output_item_id wajib diisi' }, { status: 400 })
  if (!body.output_qty || body.output_qty <= 0) return NextResponse.json({ error: 'output_qty harus > 0' }, { status: 400 })
  if (!body.lines?.length) return NextResponse.json({ error: 'BOM harus memiliki minimal 1 bahan' }, { status: 400 })

  // Validasi tidak ada BOM lain untuk item yang sama
  const { count } = await supabase
    .from('bom_headers')
    .select('id', { count: 'exact', head: true })
    .eq('output_item_id', body.output_item_id)
    .eq('user_id', access.user.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Item ini sudah memiliki BOM. Edit BOM yang ada atau hapus terlebih dahulu.' }, { status: 409 })
  }

  // Validasi output_item milik user
  const { data: outItem } = await supabase
    .from('items')
    .select('id, type')
    .eq('id', body.output_item_id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!outItem) return NextResponse.json({ error: 'Output item tidak ditemukan' }, { status: 404 })
  if (outItem.type === 'raw_material') return NextResponse.json({ error: 'Bahan mentah tidak bisa menjadi output BOM' }, { status: 400 })

  // Insert header
  const { data: header, error: hErr } = await supabase
    .from('bom_headers')
    .insert({
      user_id: access.user.id,
      store_id: body.store_id ?? null,
      output_item_id: body.output_item_id,
      output_qty: body.output_qty,
      name: body.name?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })

  // Insert lines
  const lineInserts = body.lines.map((l, i) => ({
    bom_id: header.id,
    input_item_id: l.input_item_id,
    qty_per_output: l.qty_per_output,
    sort_order: l.sort_order ?? i,
    notes: l.notes?.trim() || null,
  }))
  const { error: lErr } = await supabase.from('bom_lines').insert(lineInserts)
  if (lErr) {
    await supabase.from('bom_headers').delete().eq('id', header.id)
    return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  // Hitung HPP dan sync ke items.cost_per_unit + master_products jika ada link
  let syncedToMasterProduct = false
  try {
    const allBomInputs: BomHeaderInput[] = [{
      id: header.id,
      output_item_id: body.output_item_id,
      output_qty: body.output_qty,
      lines: body.lines.map((l) => ({ input_item_id: l.input_item_id, qty_per_output: l.qty_per_output })),
    }]

    const inputItemIds = body.lines.map((l) => l.input_item_id)
    const { data: itemsData } = await supabase
      .from('items').select('id, cost_per_unit, type').in('id', [body.output_item_id, ...inputItemIds]).eq('user_id', access.user.id)
    const { data: stockData } = await supabase
      .from('item_stock').select('item_id, avg_cost').eq('user_id', access.user.id).in('item_id', [body.output_item_id, ...inputItemIds])
    const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost as number | null]))
    const itemCosts: ItemCostData[] = (itemsData ?? []).map((i) => ({
      id: i.id, cost_per_unit: i.cost_per_unit ?? 0, avg_cost: stockMap.get(i.id) ?? null, type: i.type,
    }))
    const bomMap = new Map(allBomInputs.map((b) => [b.id, b]))
    const itemMap = new Map(itemCosts.map((i) => [i.id, i]))
    const calc = calculateBomHpp(header.id, bomMap, itemMap)
    if (!calc.has_cycle && calc.hpp_per_unit > 0) {
      const result = await syncBomHppToItem(supabase, access.user.id, body.output_item_id, calc.hpp_per_unit)
      syncedToMasterProduct = result.syncedToMasterProduct
    }
  } catch (syncErr) {
    console.error('BOM POST: sync hpp error (non-fatal):', syncErr)
  }

  return NextResponse.json({ bom: header, synced_to_master: syncedToMasterProduct }, { status: 201 })
}
