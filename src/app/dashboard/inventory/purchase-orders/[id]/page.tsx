import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { PurchaseOrderDetail } from '@/components/inventory/po-detail'
import type { Item } from '@/types'

type Params = { params: { id: string } }

export default async function PurchaseOrderDetailPage({ params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select(`
      id, user_id, store_id, po_number, date, supplier, status, notes, total_amount, created_at, updated_at,
      purchase_order_lines(id, item_id, qty_ordered, qty_received, unit_cost,
        item:items!item_id(id, name, unit, type, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!po) notFound()

  type RawLine = {
    id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number;
    item: Item | null
  }
  const lines = ((po.purchase_order_lines as unknown) as RawLine[]).map((l) => ({
    id: l.id,
    po_id: po.id as string,
    item_id: l.item_id,
    qty_ordered: l.qty_ordered,
    qty_received: l.qty_received,
    unit_cost: l.unit_cost,
    total_cost: l.qty_ordered * l.unit_cost,
    item: l.item ?? undefined,
  }))

  const poData = {
    id: po.id as string,
    user_id: po.user_id as string,
    store_id: (po.store_id as string | null) ?? null,
    po_number: (po.po_number as string | null) ?? null,
    date: po.date as string,
    supplier: (po.supplier as string | null) ?? null,
    status: po.status as 'draft' | 'confirmed' | 'received' | 'cancelled',
    notes: (po.notes as string | null) ?? null,
    total_amount: po.total_amount as number,
    created_at: po.created_at as string,
    updated_at: po.updated_at as string,
    lines,
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inventory/purchase-orders"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {poData.po_number ?? `PO-${poData.id.slice(0, 8)}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(poData.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            {poData.supplier && ` · ${poData.supplier}`}
          </p>
        </div>
      </div>

      <PurchaseOrderDetail po={poData} />
    </div>
  )
}
