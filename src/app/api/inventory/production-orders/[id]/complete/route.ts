import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { syncBomHppToItem } from '@/lib/inventory/sync-bom-hpp'

// POST /api/inventory/production-orders/[id]/complete
// Selesaikan produksi:
//  1. Buat production_out tx per input item (konsumsi bahan)
//  2. Buat production_in tx untuk output item (barang masuk stok)
//  3. Snapshot unit_cost_snapshot di setiap line
//  4. Hitung total_material_cost + hpp_per_unit
//  5. Status → completed
//  6. Sync HPP ke items.cost_per_unit + master_products (via syncBomHppToItem)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    actual_qty: number
    actual_lines?: Array<{ line_id: string; actual_qty: number }>
    notes?: string | null
  }

  if (!body.actual_qty || body.actual_qty <= 0) {
    return NextResponse.json({ error: 'actual_qty harus > 0' }, { status: 400 })
  }

  // Ambil production order + lines + BOM
  const { data: order } = await supabase
    .from('production_orders')
    .select(`
      id, user_id, store_id, bom_id, status, planned_qty, date,
      bom:bom_headers!bom_id(id, output_item_id, output_qty),
      production_order_lines(id, item_id, planned_qty)
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Production Order tidak ditemukan' }, { status: 404 })
  if (order.status === 'completed') return NextResponse.json({ error: 'Produksi sudah selesai' }, { status: 409 })
  if (order.status === 'cancelled') return NextResponse.json({ error: 'Produksi dibatalkan' }, { status: 409 })

  const bom = (order.bom as unknown) as { id: string; output_item_id: string; output_qty: number } | null
  if (!bom) return NextResponse.json({ error: 'BOM tidak ditemukan' }, { status: 404 })

  const lines = (order.production_order_lines as unknown) as Array<{
    id: string; item_id: string; planned_qty: number
  }>

  // Hitung actual_qty per line (proporsional terhadap actual_qty / planned_qty)
  const ratio = body.actual_qty / (order.planned_qty as number)

  // Ambil avg_cost terkini untuk setiap input item
  const itemIds = lines.map((l) => l.item_id)
  const { data: stockData } = await supabase
    .from('item_stock')
    .select('item_id, avg_cost')
    .eq('user_id', access.user.id)
    .in('item_id', itemIds)
  const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost as number | null]))

  // Ambil cost_per_unit sebagai fallback
  const { data: itemsData } = await supabase
    .from('items')
    .select('id, cost_per_unit')
    .in('id', itemIds)
  const costMap = new Map((itemsData ?? []).map((i) => [i.id, i.cost_per_unit as number ?? 0]))

  // Hitung actual_qty per line (dari body atau proporsional)
  const actualLineMap = new Map(
    (body.actual_lines ?? []).map((l) => [l.line_id, l.actual_qty])
  )

  const lineResults = lines.map((l) => {
    const actualQty = actualLineMap.get(l.id) ?? Math.round(l.planned_qty * ratio * 10000) / 10000
    const unitCost = stockMap.get(l.item_id) ?? costMap.get(l.item_id) ?? 0
    return { ...l, actualQty, unitCost, totalCost: actualQty * unitCost }
  })

  const totalMaterialCost = lineResults.reduce((sum, l) => sum + l.totalCost, 0)
  const hppPerUnit = body.actual_qty > 0 ? Math.round((totalMaterialCost / body.actual_qty) * 100) / 100 : 0
  const now = new Date().toISOString()
  const txDate = order.date as string

  // 1. Buat production_out transactions (bahan keluar stok)
  const outTxInserts = lineResults.map((l) => ({
    user_id: access.user.id,
    store_id: (order.store_id as string | null) ?? null,
    item_id: l.item_id,
    transaction_type: 'production_out' as const,
    reference_id: order.id,
    reference_type: 'production_order',
    qty: -l.actualQty,              // negatif = keluar stok
    unit_cost: l.unitCost,
    date: txDate,
    notes: `Produksi ${order.id.slice(0, 8)}`,
  }))

  const { error: outErr } = await supabase.from('inventory_transactions').insert(outTxInserts)
  if (outErr) return NextResponse.json({ error: `production_out: ${outErr.message}` }, { status: 500 })

  // 2. Buat production_in transaction (output item masuk stok)
  const { error: inErr } = await supabase.from('inventory_transactions').insert({
    user_id: access.user.id,
    store_id: (order.store_id as string | null) ?? null,
    item_id: bom.output_item_id,
    transaction_type: 'production_in' as const,
    reference_id: order.id,
    reference_type: 'production_order',
    qty: body.actual_qty,            // positif = masuk stok
    unit_cost: hppPerUnit,
    date: txDate,
    notes: `Hasil produksi ${order.id.slice(0, 8)}`,
  })
  if (inErr) return NextResponse.json({ error: `production_in: ${inErr.message}` }, { status: 500 })

  // 3. Update production_order_lines dengan actual_qty + unit_cost_snapshot
  await Promise.all(lineResults.map((l) =>
    supabase
      .from('production_order_lines')
      .update({ actual_qty: l.actualQty, unit_cost_snapshot: l.unitCost })
      .eq('id', l.id)
  ))

  // 4. Update production order → completed
  const { error: completeErr } = await supabase
    .from('production_orders')
    .update({
      status: 'completed',
      actual_qty: body.actual_qty,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      hpp_per_unit: hppPerUnit,
      completed_at: now,
      notes: body.notes?.trim() || (order as { notes?: string | null }).notes || null,
    })
    .eq('id', params.id)
    .eq('user_id', access.user.id)
  if (completeErr) return NextResponse.json({ error: completeErr.message }, { status: 500 })

  // 5. Sync HPP ke items.cost_per_unit + master_products
  let syncedToMaster = false
  try {
    if (hppPerUnit > 0) {
      const result = await syncBomHppToItem(supabase, access.user.id, bom.output_item_id, hppPerUnit)
      syncedToMaster = result.syncedToMasterProduct
    }
  } catch (syncErr) {
    console.error('production complete: sync hpp error (non-fatal):', syncErr)
  }

  return NextResponse.json({
    success: true,
    hpp_per_unit: hppPerUnit,
    total_material_cost: Math.round(totalMaterialCost * 100) / 100,
    synced_to_master: syncedToMaster,
  })
}
