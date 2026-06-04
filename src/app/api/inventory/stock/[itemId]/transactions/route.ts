import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { itemId: string } }

// GET /api/inventory/stock/[itemId]/transactions
export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const txType = searchParams.get('type')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')

  let query = supabase
    .from('inventory_transactions')
    .select('id, transaction_type, qty, unit_cost, date, notes, reference_type, reference_id, created_at')
    .eq('user_id', access.user.id)
    .eq('item_id', params.itemId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (txType) query = query.eq('transaction_type', txType)
  if (from)   query = query.gte('date', from)
  if (to)     query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}
