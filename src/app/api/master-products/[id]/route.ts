import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'

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

      // 1. Build MasterResolver from ALL master_products for this user
      const { data: masterRows } = await serviceClient
        .from('master_products')
        .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
        .eq('user_id', user.id)

      const resolver = new MasterResolver((masterRows ?? []) as MasterRow[])

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
          type ProdJson = { marketplace_product_id: string | null; product_name?: string | null; quantity: number }
          for (const row of oaRows as { id: string; products_json: unknown }[]) {
            const prods = (row.products_json ?? []) as ProdJson[]
            let estimatedHpp = 0
            for (const prod of prods) {
              const master = resolver.resolve({
                anyId: prod.marketplace_product_id,
                productName: prod.product_name,
              })
              if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
                estimatedHpp += (master.hpp + master.packaging_cost) * prod.quantity
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

          // Fetch order_products (any-ID + qty)
          type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
          const opRows: OpRow[] = []
          for (let i = 0; i < incomeOrderNums.length; i += OP_CHUNK) {
            const { data } = await serviceClient
              .from('order_products')
              .select('order_number,marketplace_product_id,product_name,quantity')
              .eq('user_id', user.id)
              .in('order_number', incomeOrderNums.slice(i, i + OP_CHUNK))
            if (data) opRows.push(...(data as OpRow[]))
          }

          const orderToProducts = new Map<string, Array<{ id: string; name: string | null; qty: number }>>()
          for (const row of opRows) {
            const arr = orderToProducts.get(row.order_number) ?? []
            arr.push({ id: row.marketplace_product_id, name: row.product_name, qty: row.quantity ?? 1 })
            orderToProducts.set(row.order_number, arr)
          }

          for (const order of incomeOrders as { id: string; order_number: string }[]) {
            const items = orderToProducts.get(order.order_number) ?? []
            let estimatedHpp = 0
            for (const item of items) {
              const master = resolver.resolve({ anyId: item.id, productName: item.name })
              if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
                estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
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
