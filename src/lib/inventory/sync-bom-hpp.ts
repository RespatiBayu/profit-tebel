import type { LocalSupabaseClient } from '@/lib/postgres/local-client'
import { recalculateEstimatedHppForStore } from '@/lib/recalculate-estimated-hpp'

/**
 * After a BOM is saved/updated, push the calculated HPP back to:
 *  1. items.cost_per_unit (always — makes item usable as input in other BOMs)
 *  2. master_products.hpp (only if the item is linked to a master product)
 *     then triggers order HPP recalculation.
 */
export async function syncBomHppToItem(
  supabase: LocalSupabaseClient,
  userId: string,
  outputItemId: string,
  hppPerUnit: number
): Promise<{ syncedToMasterProduct: boolean }> {
  // 1. Always update items.cost_per_unit so nested BOMs get the new cost
  await supabase
    .from('items')
    .update({ cost_per_unit: hppPerUnit })
    .eq('id', outputItemId)
    .eq('user_id', userId)

  // 2. Check if any master_product is linked to this item
  const { data: linked } = await supabase
    .from('master_products')
    .select('id, store_id')
    .eq('linked_item_id', outputItemId)
    .maybeSingle()

  if (!linked) return { syncedToMasterProduct: false }

  // 3. Push HPP to master_products
  await supabase
    .from('master_products')
    .update({ hpp: hppPerUnit })
    .eq('id', linked.id)

  // 4. Trigger order estimated_hpp recalculation
  try {
    await recalculateEstimatedHppForStore(supabase, (linked.store_id as string | null) ?? null)
  } catch (err) {
    console.error('syncBomHppToItem: recalculate error (non-fatal):', err)
  }

  return { syncedToMasterProduct: true }
}
