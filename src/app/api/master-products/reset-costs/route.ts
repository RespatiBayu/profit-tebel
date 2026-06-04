import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeMarketplaceFilter } from '@/lib/dashboard-filters'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'

// ---------------------------------------------------------------------------
// POST /api/master-products/reset-costs
// Reset HPP & packaging_cost ke 0 untuk semua produk milik user (opsional
// dibatasi store/marketplace). Setelah reset, nilai HPP & packaging diisi ulang
// dari Master Item saat produk di-link.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store')
    const marketplace = normalizeMarketplaceFilter(searchParams.get('marketplace'))

    // Ambil produk dalam scope (untuk hitung jumlah & store yang perlu di-recalc)
    const productsQuery = supabase
      .from('master_products')
      .select('id,store_id')
    if (storeId) productsQuery.eq('store_id', storeId)
    if (marketplace) productsQuery.eq('marketplace', marketplace)

    const { data: products, error: fetchErr } = await productsQuery
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const typedProducts = (products ?? []) as Array<{ id: string; store_id: string | null }>
    if (typedProducts.length === 0) {
      return NextResponse.json({ success: true, resetCount: 0 })
    }

    // Reset HPP & packaging ke 0
    const updateQuery = supabase
      .from('master_products')
      .update({ hpp: 0, packaging_cost: 0 })
    if (storeId) updateQuery.eq('store_id', storeId)
    if (marketplace) updateQuery.eq('marketplace', marketplace)
    // Batasi ke produk milik user (RLS juga membatasi, ini eksplisit & aman)
    updateQuery.in('id', typedProducts.map((p) => p.id))

    const { error: updateErr } = await updateQuery
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Hitung ulang estimated_hpp per store agar order ikut 0 (non-fatal bila gagal).
    try {
      const storeScopes = typedProducts.some((p) => !p.store_id)
        ? [null]
        : Array.from(new Set(typedProducts.map((p) => p.store_id)))
      for (const scope of storeScopes) {
        await recalculateEstimatedHppForStore(supabase, scope)
      }
    } catch (recalcErr) {
      console.error('Recalc after reset-costs error:', recalcErr)
    }

    return NextResponse.json({ success: true, resetCount: typedProducts.length })
  } catch (err) {
    console.error('reset-costs error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
