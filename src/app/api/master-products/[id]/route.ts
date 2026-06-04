import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'

function parseNonNegativeNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

// ---------------------------------------------------------------------------
// PATCH /api/master-products/[id]
// Save HPP + packaging_cost, then recalculate estimated_hpp for ALL of this
// user's orders (orders + orders_all) using canonical product ID + seller SKU resolution.
//
// Architecture:
//   - master_products keyed by Shopee numeric product ID
//   - master_products.seller_sku stores the optional Order.all bridge
//   - order_products may contain canonical IDs or seller SKUs
//   - orders_all.products_json keeps the raw SKU rows from Order.all
//   - HPP per order = SUM(master_products[resolved product].hpp + packaging) × qty
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as {
      hpp?: number
      packaging_cost?: number
      linked_item_id?: string | null
    } | null

    // Handle linked_item_id-only update (no HPP change)
    const isLinkOnlyUpdate = body !== null &&
      !('hpp' in (body ?? {})) &&
      !('packaging_cost' in (body ?? {})) &&
      'linked_item_id' in (body ?? {})

    if (isLinkOnlyUpdate) {
      const { data: product, error: fetchErr } = await supabase
        .from('master_products')
        .select('id,store_id')
        .eq('id', params.id)
        .maybeSingle()
      if (fetchErr || !product) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })

      const linkedItemId = body?.linked_item_id ?? null
      const updatePayload: Record<string, unknown> = { linked_item_id: linkedItemId }

      // When linking to an item, pull the item's HPP into the master product so
      // Mapping Produk can display it as read-only info (HPP is managed in Master Item).
      if (linkedItemId) {
        const { data: item } = await supabase
          .from('items')
          .select('cost_per_unit')
          .eq('id', linkedItemId)
          .maybeSingle()
        if (item && typeof item.cost_per_unit === 'number') {
          updatePayload.hpp = item.cost_per_unit
        }
      }

      const { error: updateErr } = await supabase
        .from('master_products')
        .update(updatePayload)
        .eq('id', params.id)
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // NOTE: Order estimated_hpp is intentionally NOT recalculated here to keep
      // linking instant/reliable (a full-store recalc can exceed the serverless
      // timeout). Order HPP refreshes when the item's cost is edited in Master Item
      // or via the "Recalculate HPP" button on the upload page.
      return NextResponse.json({ success: true, hpp: updatePayload.hpp ?? null })
    }

    const hpp = parseNonNegativeNumber(body?.hpp)
    const packaging_cost = parseNonNegativeNumber(body?.packaging_cost)

    if (hpp === null || packaging_cost === null) {
      return NextResponse.json({ error: 'Format data HPP/Packaging tidak valid' }, { status: 400 })
    }

    const { data: product, error: fetchErr } = await supabase
      .from('master_products')
      .select('id,marketplace_product_id,store_id')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchErr || !product) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })

    // Build update payload
    const updatePayload: Record<string, unknown> = { hpp, packaging_cost }
    if (body && 'linked_item_id' in body) updatePayload.linked_item_id = body.linked_item_id ?? null

    const { error: updateErr } = await supabase
      .from('master_products')
      .update(updatePayload)
      .eq('id', params.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // -----------------------------------------------------------------------
    // Recalculate estimated_hpp for ALL user orders (income + orders_all).
    // -----------------------------------------------------------------------
    try {
      await recalculateEstimatedHppForStore(supabase, (product.store_id as string | null) ?? null)
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
      .select('id')
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
