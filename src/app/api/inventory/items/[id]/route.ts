import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

// GET /api/inventory/items/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Master Item terbuka untuk paket Basic (setup HPP). Tidak butuh subscription Pro.

  const { data: item, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })

  // Ambil stok
  const { data: stock } = await supabase
    .from('item_stock')
    .select('qty_on_hand,avg_cost,last_transaction_date,transaction_count')
    .eq('item_id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  // Ambil 20 transaksi terakhir
  const { data: transactions } = await supabase
    .from('inventory_transactions')
    .select('id,transaction_type,qty,unit_cost,date,reference_type,notes,created_at')
    .eq('item_id', params.id)
    .eq('user_id', access.user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    item: {
      ...item,
      qty_on_hand: stock?.qty_on_hand ?? 0,
      avg_cost: stock?.avg_cost ?? null,
      last_transaction_date: stock?.last_transaction_date ?? null,
    },
    transactions: transactions ?? [],
  })
}

// PATCH /api/inventory/items/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Master Item terbuka untuk paket Basic (setup HPP). Tidak butuh subscription Pro.

  const body = await request.json() as {
    name?: string
    sku?: string | null
    type?: string
    unit?: string
    cost_per_unit?: number
    min_stock_qty?: number
    store_id?: string | null
    notes?: string | null
  }

  // Validasi tipe jika dikirim
  if (body.type && !['raw_material', 'semi_finished', 'finished_good'].includes(body.type)) {
    return NextResponse.json({ error: 'Tipe item tidak valid' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.sku !== undefined) patch.sku = body.sku?.trim() || null
  if (body.type !== undefined) patch.type = body.type
  if (body.unit !== undefined) patch.unit = body.unit.trim() || 'pcs'
  if (body.cost_per_unit !== undefined) patch.cost_per_unit = body.cost_per_unit
  if (body.min_stock_qty !== undefined) patch.min_stock_qty = Math.max(0, Number(body.min_stock_qty) || 0)
  if (body.store_id !== undefined) patch.store_id = body.store_id
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tidak ada field yang diupdate' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/inventory/items/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Master Item terbuka untuk paket Basic (setup HPP). Tidak butuh subscription Pro.

  // Cek apakah item dipakai di BOM
  const { count: bomCount } = await supabase
    .from('bom_lines')
    .select('id', { count: 'exact', head: true })
    .eq('input_item_id', params.id)

  if ((bomCount ?? 0) > 0) {
    return NextResponse.json({
      error: `Item ini digunakan di ${bomCount} BOM. Hapus BOM terkait terlebih dahulu.`,
    }, { status: 409 })
  }

  // Cek apakah item punya transaksi stok
  const { count: txCount } = await supabase
    .from('inventory_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', params.id)
    .eq('user_id', access.user.id)

  if ((txCount ?? 0) > 0) {
    return NextResponse.json({
      error: `Item ini memiliki ${txCount} transaksi stok. Item dengan riwayat transaksi tidak dapat dihapus.`,
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', params.id)
    .eq('user_id', access.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
