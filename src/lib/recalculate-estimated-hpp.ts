import type { LocalSupabaseClient } from '@/lib/postgres/local-client'
import { MasterResolver, type MasterRow } from '@/lib/master-resolver'

type OrdersAllProductRow = {
  marketplace_product_id: string | null
  product_name?: string | null
  quantity: number
}

type OrderProductRow = {
  order_number: string
  marketplace_product_id: string
  product_name: string | null
  quantity: number | null
}

export interface RecalculateEstimatedHppResult {
  totalMasters: number
  mastersWithHpp: number
  ordersAllUpdated: number
  ordersAllWithHpp: number
  ordersUpdated: number
  ordersWithHpp: number
  ordersNoMapping: number
  warnings: string[]
}

export async function recalculateEstimatedHppForStore(
  supabase: LocalSupabaseClient,
  storeId: string | null
): Promise<RecalculateEstimatedHppResult> {
  const warnings: string[] = []

  const masterRowsQuery = supabase
    .from('master_products')
    .select('id,marketplace_product_id,seller_sku,numeric_id,product_name,hpp,packaging_cost')
  if (storeId) {
    masterRowsQuery.eq('store_id', storeId)
  }

  const { data: masterRows, error: masterRowsError } = await masterRowsQuery
  if (masterRowsError) {
    throw masterRowsError
  }

  const typedMasterRows = (masterRows ?? []) as MasterRow[]
  const resolver = new MasterResolver(typedMasterRows)

  const totalMasters = typedMasterRows.length
  const mastersWithHpp = typedMasterRows.filter(
    (master) => (master.hpp ?? 0) > 0 || (master.packaging_cost ?? 0) > 0
  ).length

  if (totalMasters > 0 && mastersWithHpp === 0) {
    warnings.push(
      `⚠️ Tidak ada master produk yang punya HPP terisi (0 dari ${totalMasters}). Isi HPP di menu "Master Produk" dulu, baru klik Recalculate lagi.`
    )
  }

  let ordersAllUpdated = 0
  let ordersAllWithHpp = 0

  const ordersAllQuery = supabase
    .from('orders_all')
    .select('id,products_json')
  if (storeId) {
    ordersAllQuery.eq('store_id', storeId)
  }

  const { data: ordersAllRows, error: ordersAllError } = await ordersAllQuery
  if (ordersAllError) {
    throw ordersAllError
  }

  for (const row of (ordersAllRows ?? []) as { id: string; products_json: unknown }[]) {
    const products = (row.products_json ?? []) as OrdersAllProductRow[]
    let estimatedHpp = 0

    for (const product of products) {
      const master = resolver.resolve({
        anyId: product.marketplace_product_id,
        productName: product.product_name,
      })

      if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
        estimatedHpp += (master.hpp + master.packaging_cost) * product.quantity
      }
    }

    const { error: updateOrdersAllError } = await supabase
      .from('orders_all')
      .update({ estimated_hpp: estimatedHpp })
      .eq('id', row.id)

    if (updateOrdersAllError) {
      throw updateOrdersAllError
    }

    ordersAllUpdated++
    if (estimatedHpp > 0) {
      ordersAllWithHpp++
    }
  }

  let ordersUpdated = 0
  let ordersWithHpp = 0
  let ordersNoMapping = 0

  const ordersQuery = supabase
    .from('orders')
    .select('id,order_number')
  if (storeId) {
    ordersQuery.eq('store_id', storeId)
  }

  const { data: ordersRows, error: ordersError } = await ordersQuery
  if (ordersError) {
    throw ordersError
  }

  const typedOrdersRows = (ordersRows ?? []) as { id: string; order_number: string }[]
  if (typedOrdersRows.length > 0) {
    const orderNumbers = typedOrdersRows.map((row) => row.order_number)
    const orderToProducts = new Map<string, Array<{ id: string | null; name: string | null; qty: number }>>()
    const ordersAllByOrderNumber = new Map<string, OrdersAllProductRow[]>()
    const chunkSize = 200

    for (let index = 0; index < orderNumbers.length; index += chunkSize) {
      const chunk = orderNumbers.slice(index, index + chunkSize)

      const orderProductsQuery = supabase
        .from('order_products')
        .select('order_number,marketplace_product_id,product_name,quantity')
        .in('order_number', chunk)
      if (storeId) {
        orderProductsQuery.eq('store_id', storeId)
      }

      const { data: orderProducts, error: orderProductsError } = await orderProductsQuery
      if (orderProductsError) {
        throw orderProductsError
      }

      for (const row of (orderProducts ?? []) as OrderProductRow[]) {
        const rows = orderToProducts.get(row.order_number) ?? []
        rows.push({
          id: row.marketplace_product_id,
          name: row.product_name,
          qty: row.quantity ?? 1,
        })
        orderToProducts.set(row.order_number, rows)
      }

      const ordersAllChunkQuery = supabase
        .from('orders_all')
        .select('order_number,products_json')
        .in('order_number', chunk)
      if (storeId) {
        ordersAllChunkQuery.eq('store_id', storeId)
      }

      const { data: ordersAllChunk, error: ordersAllChunkError } = await ordersAllChunkQuery
      if (ordersAllChunkError) {
        throw ordersAllChunkError
      }

      for (const row of (ordersAllChunk ?? []) as { order_number: string; products_json: unknown }[]) {
        ordersAllByOrderNumber.set(
          row.order_number,
          (row.products_json ?? []) as OrdersAllProductRow[]
        )
      }
    }

    for (const order of typedOrdersRows) {
      const mappedProducts = orderToProducts.get(order.order_number) ?? []
      let products: Array<{ id: string | null; name: string | null; qty: number }> = mappedProducts.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
      }))

      if (products.length === 0) {
        const fallbackProducts = ordersAllByOrderNumber.get(order.order_number) ?? []
        products = fallbackProducts.map((item) => ({
          id: item.marketplace_product_id,
          name: item.product_name ?? null,
          qty: item.quantity,
        }))
      }

      if (products.length === 0) {
        ordersNoMapping++
        continue
      }

      let estimatedHpp = 0
      for (const product of products) {
        const master = resolver.resolve({ anyId: product.id, productName: product.name })
        if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
          estimatedHpp += (master.hpp + master.packaging_cost) * product.qty
        }
      }

      const { error: updateOrdersError } = await supabase
        .from('orders')
        .update({ estimated_hpp: estimatedHpp })
        .eq('id', order.id)

      if (updateOrdersError) {
        throw updateOrdersError
      }

      ordersUpdated++
      if (estimatedHpp > 0) {
        ordersWithHpp++
      }
    }
  }

  if (ordersNoMapping > 0) {
    warnings.push(
      `${ordersNoMapping} order income tidak punya mapping SKU (tidak ada di order_products maupun orders_all). HPP dari upload income di-preserve. Upload Order.all untuk periode tersebut supaya HPP akurat.`
    )
  }

  return {
    totalMasters,
    mastersWithHpp,
    ordersAllUpdated,
    ordersAllWithHpp,
    ordersUpdated,
    ordersWithHpp,
    ordersNoMapping,
    warnings,
  }
}
