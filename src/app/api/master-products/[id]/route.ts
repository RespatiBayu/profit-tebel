import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// PATCH /api/master-products/[id]
// Save HPP + packaging_cost, then recalculate estimated_hpp for ALL of this
// user's orders (orders + orders_all) using direct SKU lookup.
//
// Architecture (post-refactor):
//   - master_products keyed by seller SKU (e.g. "#BNYWGIEDP-AMERTA30ML")
//   - order_products has SKU + quantity (populated by Order.all uploads)
//   - orders_all.products_json has SKU + quantity per row
//   - HPP per order = SUM(master_products[SKU].hpp + packaging) × qty
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { hpp?: number; packaging_cost?: number }
    const hpp = typeof body.hpp === 'number' ? body.hpp : 0
    const packaging_cost = typeof body.packaging_cost === 'number' ? body.packaging_cost : 0

    const { data: product, error: fetchErr } = await supabase
      .from('master_products')
      .select('id,user_id,marketplace_product_id,store_id')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchErr || !product) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    if (product.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Save HPP
    const { error: updateErr } = await supabase
      .from('master_products')
      .update({ hpp, packaging_cost })
      .eq('id', params.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // -----------------------------------------------------------------------
    // Recalculate estimated_hpp for ALL user orders (income + orders_all).
    // -----------------------------------------------------------------------
    try {
      const serviceClient = await createServiceClient()
      const storeId = product.store_id as string | null

      // 1. Build SKU → HPP lookup from ALL master_products for this user
      const { data: masterRows } = await serviceClient
        .from('master_products')
        .select('marketplace_product_id,hpp,packaging_cost')
        .eq('user_id', user.id)

      const hppMap = new Map<string, { hpp: number; packaging: number }>()
      for (const mp of (masterRows ?? []) as { marketplace_product_id: string; hpp: number; packaging_cost: number }[]) {
        hppMap.set(mp.marketplace_product_id, {
          hpp: mp.hpp ?? 0,
          packaging: mp.packaging_cost ?? 0,
        })
      }

      const OP_CHUNK = 200

      // 2. Recalculate orders_all.estimated_hpp from products_json (SKU + qty)
      {
        const oaQuery = serviceClient
          .from('orders_all')
          .select('id,products_json')
          .eq('user_id', user.id)
        if (storeId) oaQuery.eq('store_id', storeId)
        const { data: oaRows } = await oaQuery

        if (oaRows && oaRows.length > 0) {
          type ProdJson = { marketplace_product_id: string | null; quantity: number }
          for (const row of oaRows as { id: string; products_json: unknown }[]) {
            const prods = (row.products_json ?? []) as ProdJson[]
            let estimatedHpp = 0
            for (const prod of prods) {
              if (!prod.marketplace_product_id) continue
              const master = hppMap.get(prod.marketplace_product_id)
              if (master && (master.hpp > 0 || master.packaging > 0)) {
                estimatedHpp += (master.hpp + master.packaging) * prod.quantity
              }
            }
            await serviceClient
              .from('orders_all')
              .update({ estimated_hpp: estimatedHpp })
              .eq('id', row.id)
          }
          console.log(`Recalculated estimated_hpp for ${oaRows.length} orders_all rows`)
        }
      }

      // 3. Recalculate orders.estimated_hpp using order_products (SKU + qty)
      {
        const incomeQuery = serviceClient
          .from('orders')
          .select('id,order_number')
          .eq('user_id', user.id)
        if (storeId) incomeQuery.eq('store_id', storeId)
        const { data: incomeOrders } = await incomeQuery

        if (incomeOrders && incomeOrders.length > 0) {
          const incomeOrderNums = (incomeOrders as { id: string; order_number: string }[]).map((r) => r.order_number)

          // Fetch order_products (SKU + qty)
          type OpRow = { order_number: string; marketplace_product_id: string; quantity: number | null }
          const opRows: OpRow[] = []
          for (let i = 0; i < incomeOrderNums.length; i += OP_CHUNK) {
            const { data } = await serviceClient
              .from('order_products')
              .select('order_number,marketplace_product_id,quantity')
              .eq('user_id', user.id)
              .in('order_number', incomeOrderNums.slice(i, i + OP_CHUNK))
            if (data) opRows.push(...(data as OpRow[]))
          }

          const orderToSkuQty = new Map<string, Array<{ sku: string; qty: number }>>()
          for (const row of opRows) {
            const arr = orderToSkuQty.get(row.order_number) ?? []
            arr.push({ sku: row.marketplace_product_id, qty: row.quantity ?? 1 })
            orderToSkuQty.set(row.order_number, arr)
          }

          for (const order of incomeOrders as { id: string; order_number: string }[]) {
            const skus = orderToSkuQty.get(order.order_number) ?? []
            let estimatedHpp = 0
            for (const s of skus) {
              const master = hppMap.get(s.sku)
              if (master && (master.hpp > 0 || master.packaging > 0)) {
                estimatedHpp += (master.hpp + master.packaging) * s.qty
              }
            }
            await serviceClient
              .from('orders')
              .update({ estimated_hpp: estimatedHpp })
              .eq('id', order.id)
          }
          console.log(`Recalculated estimated_hpp for ${incomeOrders.length} income orders`)
        }
      }
    } catch (backfillErr) {
      console.error('HPP backfill after save error:', backfillErr)
      // Non-fatal — HPP was saved, just backfill failed
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('PATCH master-products error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/master-products/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const productId = params.id

    const { data: product, error: fetchError } = await supabase
      .from('master_products')
      .select('id, user_id')
      .eq('id', productId)
      .maybeSingle()

    if (fetchError) {
      console.error('Fetch product error:', fetchError)
      return NextResponse.json(
        { error: 'Gagal mengambil data produk' },
        { status: 500 }
      )
    }

    if (!product) {
      return NextResponse.json(
        { error: 'Produk tidak ditemukan' },
        { status: 404 }
      )
    }

    if (product.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Tidak memiliki izin menghapus produk ini' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabase
      .from('master_products')
      .delete()
      .eq('id', productId)

    if (deleteError) {
      console.error('Delete product error:', deleteError)
      return NextResponse.json(
        { error: `Gagal menghapus produk: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    )
  }
}
