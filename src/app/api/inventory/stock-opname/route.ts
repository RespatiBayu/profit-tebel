import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// GET /api/inventory/stock-opname — list sessions
export async function GET(request: Request) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('stock_opname_sessions')
    .select('id, name, status, date, notes, finalized_at, created_at, updated_at, store_id')
    .eq('user_id', access.user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}

// POST /api/inventory/stock-opname — create session
// Body: { name, date, notes?, store_id?, item_ids? }
// Jika item_ids tidak dikirim → otomatis tambahkan semua items user
export async function POST(request: Request) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, date, notes, store_id, item_ids } = body as {
    name?: string
    date?: string
    notes?: string | null
    store_id?: string | null
    item_ids?: string[] | null
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nama sesi opname wajib diisi' }, { status: 400 })
  }

  // Buat session
  const { data: session, error: sessionError } = await supabase
    .from('stock_opname_sessions')
    .insert({
      user_id:  access.user.id,
      store_id: store_id ?? null,
      name:     name.trim(),
      date:     date ?? new Date().toISOString().slice(0, 10),
      notes:    notes?.trim() ?? null,
      status:   'draft',
    })
    .select()
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Gagal membuat sesi' }, { status: 500 })
  }

  // Ambil items yang akan dimasukkan ke opname
  let itemQuery = supabase
    .from('items')
    .select('id')
    .eq('user_id', access.user.id)

  if (item_ids && item_ids.length > 0) {
    itemQuery = itemQuery.in('id', item_ids)
  }

  const { data: items } = await itemQuery
  if (!items || items.length === 0) {
    return NextResponse.json({ data: session })
  }

  // Ambil saldo stok terkini untuk snapshot system_qty
  const itemIdArr = items.map((i) => i.id)
  const { data: stocks } = await supabase
    .from('item_stock')
    .select('item_id, qty_on_hand')
    .eq('user_id', access.user.id)
    .in('item_id', itemIdArr)

  const stockMap = new Map((stocks ?? []).map((s) => [s.item_id, Number(s.qty_on_hand) || 0]))

  // Insert lines dengan snapshot system_qty
  const lines = itemIdArr.map((item_id) => ({
    session_id: session.id,
    item_id,
    system_qty: stockMap.get(item_id) ?? 0,
    actual_qty: null,
    notes:      null,
  }))

  const CHUNK = 200
  for (let i = 0; i < lines.length; i += CHUNK) {
    const { error: lineError } = await supabase
      .from('stock_opname_lines')
      .insert(lines.slice(i, i + CHUNK))
    if (lineError) {
      console.error('opname lines insert error:', lineError.message)
    }
  }

  return NextResponse.json({ data: session }, { status: 201 })
}
