import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasStoreAccess } from '@/lib/store-access'

type ResetType = 'income' | 'orders_all' | 'ads_summary' | 'ads_product'

const VALID_TYPES: ResetType[] = ['income', 'orders_all', 'ads_summary', 'ads_product']

const LABELS: Record<ResetType, string> = {
  income: 'Data Penghasilan',
  orders_all: 'Semua Order',
  ads_summary: 'Data Iklan (Summary)',
  ads_product: 'Data per Produk (GMV Max Auto)',
}

/**
 * POST /api/reset-data
 * Body: { types: ResetType[], confirmation: string, storeId?: string }
 *
 * Deletes data for the selected types. When `storeId` is provided, the reset is
 * store-scoped so shared-store collaborators can operate on the same dataset.
 *
 * The `confirmation` must be literally "delete" (case-insensitive) to proceed
 * — protects against accidental fat-finger clicks.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      types?: string[]
      confirmation?: string
      storeId?: string | null
    }

    if (body.confirmation?.trim().toLowerCase() !== 'delete') {
      return NextResponse.json(
        { error: 'Konfirmasi salah. Ketik "delete" untuk melanjutkan.' },
        { status: 400 }
      )
    }

    const types = (body.types ?? []).filter((t): t is ResetType => VALID_TYPES.includes(t as ResetType))
    if (types.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu jenis data untuk direset.' }, { status: 400 })
    }

    const storeId = body.storeId?.trim() || null

    // Verify store access if storeId provided
    if (storeId) {
      const hasAccess = await userHasStoreAccess(supabase, user.id, storeId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Store tidak ditemukan' }, { status: 404 })
      }
    }

    const results: Record<string, { deleted: number; error?: string }> = {}

    for (const type of types) {
      try {
        let deleted = 0

        if (type === 'income') {
          // Delete orders (income) — order_products keep (those came from Order.all)
          const q = supabase.from('orders').delete({ count: 'exact' })
          if (storeId) q.eq('store_id', storeId)
          else q.eq('user_id', user.id)
          const { count, error } = await q
          if (error) throw error
          deleted = count ?? 0
        } else if (type === 'orders_all') {
          // Delete orders_all AND order_products (both come from Order.all)
          const oaQ = supabase.from('orders_all').delete({ count: 'exact' })
          if (storeId) oaQ.eq('store_id', storeId)
          else oaQ.eq('user_id', user.id)
          const { count: oaCount, error: oaErr } = await oaQ
          if (oaErr) throw oaErr

          const opQ = supabase.from('order_products').delete({ count: 'exact' })
          if (storeId) opQ.eq('store_id', storeId)
          else opQ.eq('user_id', user.id)
          const { error: opErr } = await opQ
          if (opErr) throw opErr

          deleted = oaCount ?? 0
        } else if (type === 'ads_summary') {
          // Format 1: ad_name IS NOT NULL (Summary per Iklan)
          const q = supabase.from('ads_data').delete({ count: 'exact' }).not('ad_name', 'is', null)
          if (storeId) q.eq('store_id', storeId)
          else q.eq('user_id', user.id)
          const { count, error } = await q
          if (error) throw error
          deleted = count ?? 0
        } else if (type === 'ads_product') {
          // Format 2: ad_name IS NULL (per-produk breakdown of GMV Max Auto)
          const q = supabase.from('ads_data').delete({ count: 'exact' }).is('ad_name', null)
          if (storeId) q.eq('store_id', storeId)
          else q.eq('user_id', user.id)
          const { count, error } = await q
          if (error) throw error
          deleted = count ?? 0
        }

        results[type] = { deleted }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Reset ${type} error:`, msg)
        results[type] = { deleted: 0, error: msg }
      }
    }

    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0)
    const summary = types.map((t) => `${LABELS[t]}: ${results[t].deleted} baris${results[t].error ? ` (error: ${results[t].error})` : ''}`).join(', ')

    return NextResponse.json({
      success: true,
      totalDeleted,
      summary,
      results,
    })
  } catch (err) {
    console.error('Reset data error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
