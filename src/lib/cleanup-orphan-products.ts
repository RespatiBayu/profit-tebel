import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hapus master_products yang "orphan": tidak direferensikan oleh order_products
 * maupun ads_data untuk store yang sama, DAN belum pernah diisi user
 * (hpp = 0 dan packaging_cost = 0). Dipanggil setelah setiap re-upload supaya
 * duplikat ID dari Shopee (SKU ID pendek vs marketplace product ID panjang)
 * otomatis bersih tanpa ganggu data HPP yang sudah diisi.
 *
 * Alasan constraint HPP/packaging = 0: kalau user sudah manual input HPP ke
 * ID tertentu, kita jangan hapus walaupun sementara nggak ada data referensi —
 * mungkin mereka baru mau upload data periode berikutnya.
 */
export async function cleanupOrphanMasterProducts(
  supabase: SupabaseClient,
  storeId: string,
): Promise<number> {
  // Fetch candidate orphans (belum diisi user)
  const { data: candidates, error: candErr } = await supabase
    .from('master_products')
    .select('id, marketplace_product_id')
    .eq('store_id', storeId)
    .eq('hpp', 0)
    .eq('packaging_cost', 0)

  if (candErr || !candidates || candidates.length === 0) return 0

  // Fetch all product IDs currently referenced in this store
  const [{ data: opRefs }, { data: adRefs }] = await Promise.all([
    supabase
      .from('order_products')
      .select('marketplace_product_id')
      .eq('store_id', storeId),
    supabase
      .from('ads_data')
      .select('product_code')
      .eq('store_id', storeId),
  ])

  const referenced = new Set<string>()
  for (const r of opRefs ?? []) {
    if (r.marketplace_product_id) referenced.add(r.marketplace_product_id)
  }
  for (const r of adRefs ?? []) {
    if (r.product_code) referenced.add(r.product_code)
  }

  const orphanIds = candidates
    .filter((c) => !referenced.has(c.marketplace_product_id))
    .map((c) => c.id)

  if (orphanIds.length === 0) return 0

  const { error: delErr } = await supabase
    .from('master_products')
    .delete()
    .in('id', orphanIds)

  if (delErr) {
    console.error('cleanupOrphanMasterProducts delete error:', delErr)
    return 0
  }

  return orphanIds.length
}
