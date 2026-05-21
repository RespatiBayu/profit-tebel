import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Hammer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { ProductionOrderDetail } from '@/components/inventory/production-order-detail'
import type { Item } from '@/types'

type Params = { params: { id: string } }

export default async function ProductionOrderDetailPage({ params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  const { data: order } = await supabase
    .from('production_orders')
    .select(`
      id, user_id, store_id, po_number, bom_id, status, planned_qty, actual_qty, date, notes,
      total_material_cost, hpp_per_unit, created_at, updated_at, completed_at,
      bom:bom_headers!bom_id(
        id, name, output_qty,
        output_item:items!output_item_id(id, name, unit, type)
      ),
      production_order_lines(id, item_id, planned_qty, actual_qty, unit_cost_snapshot,
        item:items!item_id(id, name, unit, type, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!order) notFound()

  type RawLine = {
    id: string; item_id: string; planned_qty: number; actual_qty: number | null;
    unit_cost_snapshot: number | null; item: Item | null
  }
  const rawLines = (order.production_order_lines as unknown) as RawLine[]

  // Ambil avg_cost per item
  const itemIds = rawLines.map((l) => l.item_id)
  const { data: stockData } = itemIds.length > 0
    ? await supabase.from('item_stock').select('item_id, avg_cost').eq('user_id', access.user.id).in('item_id', itemIds)
    : { data: [] }
  const stockMap = new Map((stockData ?? []).map((s) => [s.item_id, s.avg_cost as number | null]))

  const lines = rawLines.map((l) => ({
    id: l.id,
    production_order_id: order.id as string,
    item_id: l.item_id,
    planned_qty: l.planned_qty,
    actual_qty: l.actual_qty ?? null,
    unit_cost_snapshot: l.unit_cost_snapshot ?? null,
    item: l.item ?? undefined,
    avg_cost: stockMap.get(l.item_id) ?? null,
  }))

  type RawBom = {
    id: string; name: string | null; output_qty: number;
    output_item: { id: string; name: string; unit: string; type: string } | null
  }
  const rawBom = (order.bom as unknown) as RawBom | null

  const orderData = {
    id: order.id as string,
    user_id: order.user_id as string,
    store_id: (order.store_id as string | null) ?? null,
    po_number: (order.po_number as string | null) ?? null,
    bom_id: order.bom_id as string,
    status: order.status as 'draft' | 'in_progress' | 'completed' | 'cancelled',
    planned_qty: order.planned_qty as number,
    actual_qty: (order.actual_qty as number | null) ?? null,
    date: order.date as string,
    notes: (order.notes as string | null) ?? null,
    total_material_cost: (order.total_material_cost as number | null) ?? null,
    hpp_per_unit: (order.hpp_per_unit as number | null) ?? null,
    created_at: order.created_at as string,
    updated_at: order.updated_at as string,
    completed_at: (order.completed_at as string | null) ?? null,
    bom: rawBom ?? undefined,
    lines,
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inventory/production"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <Hammer className="h-5 w-5 text-primary" />
            {orderData.po_number ?? `PROD-${orderData.id.slice(0, 8)}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(orderData.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            {rawBom?.output_item && ` · ${rawBom.output_item.name}`}
          </p>
        </div>
      </div>

      <ProductionOrderDetail order={orderData} />
    </div>
  )
}
