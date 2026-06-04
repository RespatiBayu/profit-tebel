import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

// POST /api/inventory/items/import
// Import master products (menu utama) into inventory as "Barang Jadi" items,
// and automatically link each master product to the created/matched item
// (master_products.linked_item_id). Linking enables BOM HPP → profit sync.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Master Item terbuka untuk paket Basic (setup HPP). Tidak butuh subscription Pro.

  const body = await request.json().catch(() => null) as {
    product_ids?: string[]
  } | null

  const productIds = (body?.product_ids ?? []).filter((id) => typeof id === 'string' && id.trim())
  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Pilih minimal satu produk untuk diimpor' }, { status: 400 })
  }

  // Fetch the selected master products (RLS scopes to current user)
  const { data: products, error: fetchErr } = await supabase
    .from('master_products')
    .select('id, marketplace_product_id, seller_sku, product_name, hpp, store_id, linked_item_id')
    .in('id', productIds)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!products || products.length === 0) {
    return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
  }

  // Existing items by SKU so we link instead of creating duplicates
  const { data: existingItems } = await supabase
    .from('items')
    .select('id, sku')
    .eq('user_id', access.user.id)
    .not('sku', 'is', null)

  const itemBySku = new Map<string, string>()
  for (const it of existingItems ?? []) {
    if (it.sku) itemBySku.set(it.sku.trim().toLowerCase(), it.id)
  }

  let created = 0
  let linked = 0
  let skipped = 0

  for (const product of products) {
    // Already linked → nothing to do
    if (product.linked_item_id) { skipped++; continue }

    const sku = (product.seller_sku?.trim() || product.marketplace_product_id?.trim() || null)

    // Try to link an existing item with matching SKU
    let itemId: string | null = sku ? (itemBySku.get(sku.toLowerCase()) ?? null) : null

    if (!itemId) {
      const { data: newItem, error: insertErr } = await supabase
        .from('items')
        .insert({
          user_id: access.user.id,
          store_id: product.store_id ?? null,
          name: product.product_name || 'Produk tanpa nama',
          sku,
          type: 'finished_good',
          unit: 'pcs',
          cost_per_unit: product.hpp ?? 0,
          notes: 'Diimpor dari Master Produk',
        })
        .select('id, sku')
        .single()

      if (insertErr || !newItem) { skipped++; continue }
      itemId = newItem.id
      if (newItem.sku) itemBySku.set(newItem.sku.trim().toLowerCase(), newItem.id)
      created++
    } else {
      linked++
    }

    // Auto-link master product → item
    const { error: linkErr } = await supabase
      .from('master_products')
      .update({ linked_item_id: itemId })
      .eq('id', product.id)

    if (linkErr) skipped++
  }

  return NextResponse.json({
    success: true,
    created,
    linked,
    skipped,
    imported: created + linked,
  })
}
