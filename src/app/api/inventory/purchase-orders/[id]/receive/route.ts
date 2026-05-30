import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// POST /api/inventory/purchase-orders/[id]/receive
// Tandai PO sebagai diterima + buat inventory_transactions untuk setiap line
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.hasInventoryAccess) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

  // Ambil PO + lines
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select(`
      id, status, date, store_id,
      purchase_order_lines(id, item_id, qty_ordered, qty_received, unit_cost)
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 })
  if (!po) return NextResponse.json({ error: 'PO tidak ditemukan' }, { status: 404 })
  if (po.status === 'received') return NextResponse.json({ error: 'PO sudah diterima sebelumnya' }, { status: 409 })
  if (po.status === 'cancelled') return NextResponse.json({ error: 'PO yang dibatalkan tidak bisa diterima' }, { status: 409 })

  const lines = (po.purchase_order_lines as unknown) as Array<{
    id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number
  }>

  if (!lines.length) return NextResponse.json({ error: 'PO tidak memiliki baris item' }, { status: 400 })

  // Buat inventory_transactions untuk setiap line
  const txInserts = lines.map((l) => ({
    user_id: access.user.id,
    store_id: (po.store_id as string | null) ?? null,
    item_id: l.item_id,
    transaction_type: 'purchase_in' as const,
    reference_id: po.id,
    reference_type: 'purchase_order',
    qty: l.qty_ordered,
    unit_cost: l.unit_cost,
    date: po.date as string,
    notes: `Terima PO`,
  }))

  const { error: txErr } = await supabase.from('inventory_transactions').insert(txInserts)
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Update qty_received di semua lines
  const lineUpdates = lines.map((l) =>
    supabase
      .from('purchase_order_lines')
      .update({ qty_received: l.qty_ordered })
      .eq('id', l.id)
  )
  await Promise.all(lineUpdates)

  // Update status PO → received
  const { error: statusErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'received' })
    .eq('id', params.id)
    .eq('user_id', access.user.id)
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

  return NextResponse.json({ success: true, transactions_created: txInserts.length })
}
