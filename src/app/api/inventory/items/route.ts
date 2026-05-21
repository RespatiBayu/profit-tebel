import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/items?store_id=&type=raw_material|semi_finished|finished_good&q=
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')
  const type = searchParams.get('type')
  const q = searchParams.get('q')?.trim()

  // Fetch items
  let query = supabase
    .from('items')
    .select('id,user_id,store_id,name,sku,type,unit,cost_per_unit,notes,created_at,updated_at')
    .eq('user_id', access.user.id)
    .order('type')
    .order('name')

  if (storeId) query = query.eq('store_id', storeId)
  if (type) query = query.eq('type', type)
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`)

  const { data: items, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch stok terkini dari view item_stock
  const itemIds = (items ?? []).map((i) => i.id)
  const stockMap = new Map<string, { qty_on_hand: number; avg_cost: number | null }>()

  if (itemIds.length > 0) {
    const { data: stocks } = await supabase
      .from('item_stock')
      .select('item_id,qty_on_hand,avg_cost')
      .eq('user_id', access.user.id)
      .in('item_id', itemIds)

    for (const s of stocks ?? []) {
      stockMap.set(s.item_id, { qty_on_hand: s.qty_on_hand ?? 0, avg_cost: s.avg_cost ?? null })
    }
  }

  const result = (items ?? []).map((item) => ({
    ...item,
    qty_on_hand: stockMap.get(item.id)?.qty_on_hand ?? 0,
    avg_cost: stockMap.get(item.id)?.avg_cost ?? null,
  }))

  return NextResponse.json({ items: result })
}

// POST /api/inventory/items
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  const body = await request.json() as {
    name: string
    sku?: string | null
    type: string
    unit: string
    cost_per_unit: number
    store_id?: string | null
    notes?: string | null
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Nama item wajib diisi' }, { status: 400 })
  if (!['raw_material', 'semi_finished', 'finished_good'].includes(body.type)) {
    return NextResponse.json({ error: 'Tipe item tidak valid' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('items')
    .insert({
      user_id: access.user.id,
      store_id: body.store_id ?? null,
      name: body.name.trim(),
      sku: body.sku?.trim() || null,
      type: body.type,
      unit: body.unit?.trim() || 'pcs',
      cost_per_unit: body.cost_per_unit ?? 0,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
