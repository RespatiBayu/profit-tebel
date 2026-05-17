import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'
import { userHasStoreAccess } from '@/lib/store-access'

/**
 * POST /api/recalculate-hpp
 * Body: { storeId?: string }
 *
 * Manually triggers HPP recalculation for all of the user's orders + orders_all
 * using the current master_products HPP values. Used as a backup when auto-recalc
 * during upload doesn't work as expected.
 *
 * Architecture:
 *   - master_products keyed by Shopee numeric product ID
 *   - master_products.seller_sku stores the optional Order.all SKU bridge
 *   - order_products may contain canonical IDs or seller SKUs, both resolved
 *   - orders_all.products_json still stores raw SKU rows from Order.all
 *   - HPP = SUM(master_products[resolved product].hpp + packaging) × quantity
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { storeId?: string | null }
    const storeId = body.storeId?.trim() || null

    if (storeId) {
      const hasAccess = await userHasStoreAccess(supabase, user.id, storeId)
      if (!hasAccess) return NextResponse.json({ error: 'Store tidak ditemukan' }, { status: 404 })
    }

    const result = await recalculateEstimatedHppForStore(supabase, storeId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error('Recalculate HPP error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
