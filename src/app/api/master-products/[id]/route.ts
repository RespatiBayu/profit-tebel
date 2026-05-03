import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// PATCH /api/master-products/[id]
// Save HPP + packaging_cost, then recalculate estimated_hpp in orders_all
// for any rows belonging to this user whose products_json contains this
// product (via the seller_sku → numeric_id mapping).
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

    // Verify ownership + get marketplace_product_id for backfill
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
    // Backfill estimated_hpp in orders_all for this user.
    // We recompute ALL orders_all rows (not just this product) because:
    // - seller SKU → numeric ID mapping is built from cross-referencing
    //   order_numbers, so we need to rebuild the full mapping.
    // - The volume is manageable (single user's orders).
    // -----------------------------------------------------------------------
    try {
      const serviceClient = await createServiceClient()
      const storeId = product.store_id as string | null

      // Fetch all orders_all rows for this user (or this store if scoped)
      const oaQuery = serviceClient
        .from('orders_all')
        .select('id,order_number,products_json')
        .eq('user_id', user.id)
      if (storeId) oaQuery.eq('store_id', storeId)
      const { data: oaRows } = await oaQuery

      if (oaRows && oaRows.length > 0) {
        type ProdJson = { marketplace_product_id: string | null; quantity: number }

        // Collect all order_numbers to look up order_products
        const oaOrderNumbers = oaRows.map((r: { order_number: string }) => r.order_number)

        // Fetch order_products for those orders
        const OP_CHUNK = 200
        const opRows: { order_number: string; marketplace_product_id: string }[] = []
        for (let i = 0; i < oaOrderNumbers.length; i += OP_CHUNK) {
          const { data } = await serviceClient
            .from('order_products')
            .select('order_number,marketplace_product_id')
            .in('order_number', oaOrderNumbers.slice(i, i + OP_CHUNK))
          if (data) opRows.push(...(data as typeof opRows))
        }

        // Build order_number → [numeric_ids]
        const opByOrder = new Map<string, string[]>()
        for (const row of opRows) {
          const arr = opByOrder.get(row.order_number) ?? []
          arr.push(row.marketplace_product_id)
          opByOrder.set(row.order_number, arr)
        }

        // Build seller_sku → numeric_id mapping
        const sellerSkuToNumericId = new Map<string, string>()
        for (const row of oaRows as { order_number: string; products_json: unknown }[]) {
          const numericIds = opByOrder.get(row.order_number)
          if (!numericIds?.length) continue
          const prods = ((row.products_json ?? []) as ProdJson[]).filter((p) => p.marketplace_product_id)
          if (!prods.length) continue
          if (prods.length === 1 && numericIds.length === 1) {
            sellerSkuToNumericId.set(prods[0].marketplace_product_id!, numericIds[0])
          } else if (prods.length === numericIds.length) {
            for (let i = 0; i < prods.length; i++) {
              const sk = prods[i].marketplace_product_id!
              if (!sellerSkuToNumericId.has(sk)) sellerSkuToNumericId.set(sk, numericIds[i])
            }
          }
        }

        // Fetch ALL master_products HPP for this user
        const { data: masterRows } = await serviceClient
          .from('master_products')
          .select('marketplace_product_id,hpp,packaging_cost')
          .eq('user_id', user.id)

        const hppLookup = new Map<string, { hpp: number; packaging: number }>()
        for (const mp of (masterRows ?? []) as { marketplace_product_id: string; hpp: number; packaging_cost: number }[]) {
          hppLookup.set(mp.marketplace_product_id, { hpp: mp.hpp ?? 0, packaging: mp.packaging_cost ?? 0 })
        }

        const resolveHpp = (sellerSku: string | null) => {
          if (!sellerSku) return undefined
          if (hppLookup.has(sellerSku)) return hppLookup.get(sellerSku)
          const numericId = sellerSkuToNumericId.get(sellerSku)
          return numericId ? hppLookup.get(numericId) : undefined
        }

        // Recompute estimated_hpp for all orders_all rows
        for (const row of oaRows as { id: string; products_json: unknown }[]) {
          const prods = ((row.products_json ?? []) as ProdJson[])
          let estimatedHpp = 0
          for (const prod of prods) {
            const master = resolveHpp(prod.marketplace_product_id)
            if (master && (master.hpp > 0 || master.packaging > 0)) {
              estimatedHpp += (master.hpp + master.packaging) * prod.quantity
            }
          }
          await serviceClient
            .from('orders_all')
            .update({ estimated_hpp: estimatedHpp })
            .eq('id', row.id)
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

    // Verify ownership — product must belong to user
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

    // Delete the product
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
