import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { calculateBomHpp } from '@/lib/inventory/bom-calculator'
import type { BomHeaderInput, ItemCostData } from '@/lib/inventory/bom-calculator'

type Params = { params: { id: string } }

// GET /api/inventory/bom/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { data: bom, error } = await supabase
    .from('bom_headers')
    .select(`
      id, output_item_id, output_qty, name, notes, is_active, created_at, updated_at,
      output_item:items!output_item_id(id, name, type, unit, cost_per_unit),
      bom_lines(id, input_item_id, qty_per_output, sort_order, notes,
        input_item:items!input_item_id(id, name, type, unit, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bom) return NextResponse.json({ error: 'BOM tidak ditemukan' }, { status: 404 })

  // Kumpulkan semua item IDs untuk ambil avg_cost
  const allItemIds = new Set<string>([bom.output_item_id])
  const lines = (bom.bom_lines as unknown) as Array<{ input_item_id: string; qty_per_output: number; sort_order?: number; input_item: { id: string; name: string; type: string; unit: string; cost_per_unit: number } | null }>
  lines.forEach((l) => allItemIds.add(l.input_item_id))

  // Ambil semua BOM user untuk recursive calc
  const { data: allBoms } = await supabase
    .from('bom_headers')
    .select('id, output_item_id, output_qty, bom_lines(input_item_id, qty_per_output)')
    .eq('user_id', access.user.id)

  const { data: stockData } = await supabase
    .from('item_stock')
    .select('item_id, avg_cost')
    .eq('user_id', access.user.id)
    .in('item_id', Array.from(allItemIds))

  const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost as number | null]))

  // Build item cost map dari joined data
  const itemCosts: ItemCostData[] = lines
    .filter((l) => l.input_item)
    .map((l) => ({
      id: l.input_item!.id,
      cost_per_unit: l.input_item!.cost_per_unit ?? 0,
      avg_cost: stockMap.get(l.input_item!.id) ?? null,
      type: l.input_item!.type,
    }))

  // Tambah output item
  const outItem = (bom.output_item as unknown) as { id: string; name: string; type: string; unit: string; cost_per_unit: number } | null
  if (outItem) {
    itemCosts.push({ id: outItem.id, cost_per_unit: outItem.cost_per_unit ?? 0, avg_cost: stockMap.get(outItem.id) ?? null, type: outItem.type })
  }

  const bomInputs: BomHeaderInput[] = (allBoms ?? []).map((b) => ({
    id: b.id,
    output_item_id: b.output_item_id,
    output_qty: b.output_qty,
    lines: (b.bom_lines as Array<{ input_item_id: string; qty_per_output: number }> ?? []).map((l) => ({
      input_item_id: l.input_item_id,
      qty_per_output: l.qty_per_output,
    })),
  }))

  const bomMap = new Map(bomInputs.map((b) => [b.id, b]))
  const itemMap = new Map(itemCosts.map((i) => [i.id, i]))
  const calc = calculateBomHpp(bom.id, bomMap, itemMap)

  // Sort lines by sort_order
  const sortedLines = [...lines].sort((a, b) => ((a as { sort_order?: number }).sort_order ?? 0) - ((b as { sort_order?: number }).sort_order ?? 0))

  return NextResponse.json({
    bom: {
      ...bom,
      bom_lines: sortedLines,
    },
    calc,
  })
}

// PATCH /api/inventory/bom/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    output_qty?: number
    name?: string | null
    notes?: string | null
    is_active?: boolean
    lines?: Array<{ input_item_id: string; qty_per_output: number; sort_order?: number; notes?: string | null }>
  }

  // Update header
  const patch: Record<string, unknown> = {}
  if (body.output_qty !== undefined) patch.output_qty = body.output_qty
  if (body.name !== undefined) patch.name = body.name?.trim() || null
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null
  if (body.is_active !== undefined) patch.is_active = body.is_active

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from('bom_headers')
      .update(patch)
      .eq('id', params.id)
      .eq('user_id', access.user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace lines jika dikirim (delete all + re-insert)
  if (body.lines !== undefined) {
    if (!body.lines.length) return NextResponse.json({ error: 'BOM harus memiliki minimal 1 bahan' }, { status: 400 })

    await supabase.from('bom_lines').delete().eq('bom_id', params.id)

    const lineInserts = body.lines.map((l, i) => ({
      bom_id: params.id,
      input_item_id: l.input_item_id,
      qty_per_output: l.qty_per_output,
      sort_order: l.sort_order ?? i,
      notes: l.notes?.trim() || null,
    }))
    const { error: lErr } = await supabase.from('bom_lines').insert(lineInserts)
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/inventory/bom/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  // Cek apakah BOM dipakai sebagai input BOM lain (via output_item_id)
  const { data: bom } = await supabase
    .from('bom_headers')
    .select('output_item_id')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (!bom) return NextResponse.json({ error: 'BOM tidak ditemukan' }, { status: 404 })

  const { count } = await supabase
    .from('bom_lines')
    .select('id', { count: 'exact', head: true })
    .eq('input_item_id', bom.output_item_id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Output item BOM ini digunakan sebagai bahan di ${count} BOM lain. Hapus dari BOM tersebut terlebih dahulu.`,
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('bom_headers')
    .delete()
    .eq('id', params.id)
    .eq('user_id', access.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
