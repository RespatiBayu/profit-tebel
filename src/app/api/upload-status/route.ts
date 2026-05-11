import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/upload-status?store=<id>
 * Returns the user's current data state — used by the upload page to enforce
 * "Order.all must be uploaded before Income" workflow:
 *
 *   - hasOrdersAll: Order.all has been uploaded for this user/store
 *   - ordersAllCount: number of orders_all rows (informational)
 *   - hasMasterProducts: any master_products exist (informational)
 *
 * Income upload should be DISABLED in the UI when hasOrdersAll is false.
 * Ads uploads are independent — no dependency.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store')

  const oaQ = supabase
    .from('orders_all')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (storeId) oaQ.eq('store_id', storeId)
  const { count: ordersAllCount } = await oaQ

  const mpQ = supabase
    .from('master_products')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (storeId) mpQ.eq('store_id', storeId)
  const { count: masterCount } = await mpQ

  return NextResponse.json({
    hasOrdersAll: (ordersAllCount ?? 0) > 0,
    ordersAllCount: ordersAllCount ?? 0,
    hasMasterProducts: (masterCount ?? 0) > 0,
    masterProductsCount: masterCount ?? 0,
  })
}
