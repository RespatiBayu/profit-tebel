import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MasterResolver, normalizeName, type MasterRow } from '@/lib/master-resolver'

/**
 * POST /api/recalculate-hpp
 * Body: { storeId?: string }
 *
 * Manually triggers HPP recalculation for all of the user's orders + orders_all
 * using the current master_products HPP values. Used as a backup when auto-recalc
 * during upload doesn't work as expected.
 *
 * Architecture (post-SKU-refactor):
 *   - master_products keyed by seller SKU
 *   - order_products has SKU + quantity (from Order.all)
 *   - orders_all.products_json has SKU + quantity per row
 *   - HPP = SUM(master_products[SKU].hpp + packaging) × quantity
 *
 * Also auto-migrates legacy numeric-ID master_products → SKU (matching by
 * product_name) when SKU data is present in orders_all.products_json.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as { storeId?: string | null }
    const storeId = body.storeId?.trim() || null

    if (storeId) {
      const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('id', storeId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!store) return NextResponse.json({ error: 'Store tidak ditemukan' }, { status: 404 })
    }

    const serviceClient = await createServiceClient()
    const warnings: string[] = []

    // =====================================================================
    // STEP 1: Try to auto-migrate any remaining numeric-ID master_products
    // to SKU IDs by matching product_name against orders_all.products_json.
    // =====================================================================
    let migratedCount = 0
    {
      // Get orders_all to extract SKU → product_name mapping
      const oaQuery = serviceClient
        .from('orders_all')
        .select('products_json')
        .eq('user_id', user.id)
      if (storeId) oaQuery.eq('store_id', storeId)
      const { data: oaForMap } = await oaQuery

      const skuToName = new Map<string, string>()
      if (oaForMap) {
        type ProdJson = { marketplace_product_id: string | null; product_name: string | null }
        for (const row of oaForMap as { products_json: unknown }[]) {
          const prods = (row.products_json ?? []) as ProdJson[]
          for (const p of prods) {
            if (p.marketplace_product_id && p.product_name && !skuToName.has(p.marketplace_product_id)) {
              skuToName.set(p.marketplace_product_id, p.product_name)
            }
          }
        }
      }

      if (skuToName.size > 0) {
        const { data: existingMasters } = await serviceClient
          .from('master_products')
          .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
          .eq('user_id', user.id)

        const byName = new Map<string, MasterRow>()
        const bySku = new Set<string>()
        for (const mp of (existingMasters ?? []) as MasterRow[]) {
          if (mp.product_name) {
            const normName = normalizeName(mp.product_name)
            const prev = byName.get(normName)
            if (!prev || /^\d+$/.test(prev.marketplace_product_id)) {
              byName.set(normName, mp)
            }
          }
          bySku.add(mp.marketplace_product_id)
        }

        for (const [sku, name] of Array.from(skuToName.entries())) {
          if (bySku.has(sku)) continue
          const normName = normalizeName(name)
          const matched = byName.get(normName)
          if (matched && /^\d+$/.test(matched.marketplace_product_id)) {
            // Rename numeric ID → SKU, preserve numeric in numeric_id column
            const { error } = await serviceClient
              .from('master_products')
              .update({
                marketplace_product_id: sku,
                numeric_id: matched.numeric_id ?? matched.marketplace_product_id,
              })
              .eq('id', matched.id)
            if (!error) {
              migratedCount++
              bySku.add(sku)
              byName.delete(normName)
              console.log(`Migrated master "${name}": ${matched.marketplace_product_id} → ${sku}`)
            } else {
              console.error(`Migrate failed for ${name}:`, error.message)
            }
          }
        }
      }
    }
    if (migratedCount > 0) warnings.push(`${migratedCount} master produk dimigrasi dari numeric ID → SKU`)

    // =====================================================================
    // STEP 2: Build MasterResolver from current master_products state
    // =====================================================================
    const { data: masterRows } = await serviceClient
      .from('master_products')
      .select('id,marketplace_product_id,numeric_id,product_name,hpp,packaging_cost')
      .eq('user_id', user.id)

    const resolver = new MasterResolver((masterRows ?? []) as MasterRow[])

    // =====================================================================
    // STEP 3: Recalculate orders_all.estimated_hpp from products_json
    // =====================================================================
    let oaUpdated = 0
    let oaWithHpp = 0
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
          const { error } = await serviceClient
            .from('orders_all')
            .update({ estimated_hpp: estimatedHpp })
            .eq('id', row.id)
          if (!error) {
            oaUpdated++
            if (estimatedHpp > 0) oaWithHpp++
          }
        }
      }
    }

    // =====================================================================
    // STEP 4: Recalculate orders.estimated_hpp (income) using order_products
    // =====================================================================
    let ordersUpdated = 0
    let ordersWithHpp = 0
    let ordersNoMapping = 0
    {
      const ordersQuery = serviceClient
        .from('orders')
        .select('id,order_number')
        .eq('user_id', user.id)
      if (storeId) ordersQuery.eq('store_id', storeId)
      const { data: incomeOrders } = await ordersQuery

      if (incomeOrders && incomeOrders.length > 0) {
        const orderNums = (incomeOrders as { id: string; order_number: string }[]).map((r) => r.order_number)

        type OpRow = { order_number: string; marketplace_product_id: string; product_name: string | null; quantity: number | null }
        const opRows: OpRow[] = []
        const OP_CHUNK = 200
        for (let i = 0; i < orderNums.length; i += OP_CHUNK) {
          const { data } = await serviceClient
            .from('order_products')
            .select('order_number,marketplace_product_id,product_name,quantity')
            .eq('user_id', user.id)
            .in('order_number', orderNums.slice(i, i + OP_CHUNK))
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
          if (items.length === 0) ordersNoMapping++
          let estimatedHpp = 0
          for (const item of items) {
            const master = resolver.resolve({ anyId: item.id, productName: item.name })
            if (master && (master.hpp > 0 || master.packaging_cost > 0)) {
              estimatedHpp += (master.hpp + master.packaging_cost) * item.qty
            }
          }
          const { error } = await serviceClient
            .from('orders')
            .update({ estimated_hpp: estimatedHpp })
            .eq('id', order.id)
          if (!error) {
            ordersUpdated++
            if (estimatedHpp > 0) ordersWithHpp++
          }
        }
      }
    }

    if (ordersNoMapping > 0) {
      warnings.push(
        `${ordersNoMapping} dari ${ordersUpdated} order income tidak punya SKU mapping di order_products. Upload file Order.all untuk periode tersebut.`
      )
    }

    return NextResponse.json({
      success: true,
      migratedMasters: migratedCount,
      ordersAllUpdated: oaUpdated,
      ordersAllWithHpp: oaWithHpp,
      ordersUpdated,
      ordersWithHpp,
      ordersNoMapping,
      warnings,
    })
  } catch (err) {
    console.error('Recalculate HPP error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

