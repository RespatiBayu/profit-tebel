/**
 * sync-sale-out.ts
 *
 * Sinkronisasi otomatis: orders_all (status Selesai) → inventory_transactions (sale_out)
 *
 * Logic:
 * 1. Ambil semua orders_all status='Selesai' milik user (per store)
 * 2. Filter yang belum punya inventory_transaction dengan reference_id = orders_all.id
 * 3. Untuk tiap order, loop products_json → resolve ke master_products.linked_item_id
 * 4. Insert sale_out transaction (qty negatif = stok keluar)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SyncSaleOutResult {
  ordersProcessed: number
  transactionsCreated: number
  skippedNoLink: number
  warnings: string[]
}

type ProductsJsonItem = {
  marketplace_product_id: string | null
  product_name?: string | null
  quantity: number
}

type OrdersAllRow = {
  id: string
  store_id: string
  order_number: string
  order_complete_date: string | null
  order_date: string | null
  products_json: ProductsJsonItem[]
}

export async function syncSaleOutInventory(
  supabase: SupabaseClient,
  userId: string,
  storeId: string | null,
): Promise<SyncSaleOutResult> {
  const warnings: string[] = []
  let ordersProcessed = 0
  let transactionsCreated = 0
  let skippedNoLink = 0

  // 1. Ambil semua Selesai orders_all untuk user (+ store jika difilter)
  let ordersQuery = supabase
    .from('orders_all')
    .select('id, store_id, order_number, order_complete_date, order_date, products_json')
    .eq('user_id', userId)
    .eq('status_pesanan', 'Selesai')

  if (storeId) ordersQuery = ordersQuery.eq('store_id', storeId)

  const { data: ordersData, error: ordersError } = await ordersQuery
  if (ordersError) {
    warnings.push(`Gagal mengambil orders_all: ${ordersError.message}`)
    return { ordersProcessed: 0, transactionsCreated: 0, skippedNoLink: 0, warnings }
  }

  const orders = (ordersData ?? []) as OrdersAllRow[]
  if (orders.length === 0) {
    return { ordersProcessed: 0, transactionsCreated: 0, skippedNoLink: 0, warnings }
  }

  // 2. Ambil semua reference_id yang sudah ada di inventory_transactions (type=sale_out)
  //    untuk user ini → hindari duplikat
  const orderIds = orders.map((o) => o.id)

  // Fetch existing sale_out references in chunks of 200
  const CHUNK = 200
  const existingRefIds = new Set<string>()
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK)
    const { data: existingTx } = await supabase
      .from('inventory_transactions')
      .select('reference_id')
      .eq('user_id', userId)
      .eq('transaction_type', 'sale_out')
      .eq('reference_type', 'order_all')
      .in('reference_id', chunk)
    for (const tx of existingTx ?? []) {
      if (tx.reference_id) existingRefIds.add(tx.reference_id)
    }
  }

  // 3. Kumpulkan marketplace_product_id unik yang perlu di-resolve
  const newOrders = orders.filter((o) => !existingRefIds.has(o.id))
  if (newOrders.length === 0) {
    return { ordersProcessed: 0, transactionsCreated: 0, skippedNoLink: 0, warnings }
  }

  const allProductIds = new Set<string>()
  for (const order of newOrders) {
    for (const p of order.products_json ?? []) {
      if (p.marketplace_product_id) allProductIds.add(p.marketplace_product_id)
    }
  }

  // 4. Fetch master_products → linked_item_id mapping (per store or user-wide)
  //    Master products bisa per store — ambil semua yang punya linked_item_id
  const productIdArr = Array.from(allProductIds)
  const masterMap = new Map<string, { item_id: string; store_id: string | null }>()

  for (let i = 0; i < productIdArr.length; i += CHUNK) {
    const chunk = productIdArr.slice(i, i + CHUNK)
    let q = supabase
      .from('master_products')
      .select('marketplace_product_id, linked_item_id, store_id')
      .not('linked_item_id', 'is', null)
      .in('marketplace_product_id', chunk)
    if (storeId) q = q.eq('store_id', storeId)

    const { data: masters } = await q
    for (const m of masters ?? []) {
      if (m.marketplace_product_id && m.linked_item_id) {
        masterMap.set(m.marketplace_product_id, {
          item_id: m.linked_item_id as string,
          store_id: m.store_id as string | null,
        })
      }
    }
  }

  // 5. Build inventory_transactions rows untuk setiap order baru
  const txRows: Array<{
    user_id: string
    store_id: string | null
    item_id: string
    transaction_type: 'sale_out'
    reference_id: string
    reference_type: 'order_all'
    qty: number
    unit_cost: null
    date: string
    notes: string
  }> = []

  for (const order of newOrders) {
    const products = order.products_json ?? []
    if (products.length === 0) continue

    const txDate = order.order_complete_date ?? order.order_date ?? new Date().toISOString().slice(0, 10)
    let orderHasLink = false

    for (const product of products) {
      const pid = product.marketplace_product_id
      if (!pid) { skippedNoLink++; continue }

      const master = masterMap.get(pid)
      if (!master) { skippedNoLink++; continue }

      orderHasLink = true
      txRows.push({
        user_id: userId,
        store_id: order.store_id,
        item_id: master.item_id,
        transaction_type: 'sale_out',
        reference_id: order.id,
        reference_type: 'order_all',
        qty: -(Math.abs(product.quantity)),   // negatif = stok keluar
        unit_cost: null,
        date: txDate,
        notes: `Order #${order.order_number}`,
      })
    }

    if (orderHasLink) ordersProcessed++
  }

  // 6. Insert transactions in chunks
  if (txRows.length > 0) {
    for (let i = 0; i < txRows.length; i += CHUNK) {
      const chunk = txRows.slice(i, i + CHUNK)
      const { error: insertError } = await supabase
        .from('inventory_transactions')
        .insert(chunk)
      if (insertError) {
        warnings.push(`Sebagian transaksi gagal disimpan: ${insertError.message}`)
      } else {
        transactionsCreated += chunk.length
      }
    }
  }

  return { ordersProcessed, transactionsCreated, skippedNoLink, warnings }
}
