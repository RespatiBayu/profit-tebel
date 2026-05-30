import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { syncSaleOutInventory } from '@/lib/inventory/sync-sale-out'

// POST /api/inventory/stock/sync-sale-out
// Body: { storeId?: string }
// Trigger manual sync: orders_all (Selesai) → inventory_transactions (sale_out)
export async function POST(request: Request) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { storeId?: string | null }
  const storeId = body.storeId?.trim() || null

  try {
    const result = await syncSaleOutInventory(supabase, access.user.id, storeId)
    return NextResponse.json({ data: result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
