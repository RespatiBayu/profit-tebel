import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { PoForm } from '@/components/inventory/po-form'
import type { PoLineData } from '@/components/inventory/po-line-editor'
import type { Item } from '@/types'

type Params = { params: { id: string } }

export default async function EditPurchaseOrderPage({ params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, date, supplier, status, notes,
      purchase_order_lines(id, item_id, qty_ordered, qty_received, unit_cost,
        item:items!item_id(id, name, unit, type, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!po) notFound()
  if (po.status === 'received' || po.status === 'cancelled') notFound()

  type RawLine = {
    id: string; item_id: string; qty_ordered: number; qty_received: number; unit_cost: number;
    item: Item | null
  }
  const lines: PoLineData[] = ((po.purchase_order_lines as unknown) as RawLine[]).map((l) => ({
    _key: l.id,
    item_id: l.item_id,
    item: l.item ?? undefined,
    qty_ordered: l.qty_ordered,
    unit_cost: l.unit_cost,
  }))

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <Link
          href={`/dashboard/inventory/purchase-orders/${po.id}`}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Edit PO
          </h1>
          <p className="text-sm text-muted-foreground">{po.po_number ?? `PO-${po.id.slice(0, 8)}`}</p>
        </div>
      </div>

      <PoForm
        poId={po.id}
        initialData={{
          po_number: po.po_number ?? '',
          date: po.date as string,
          supplier: po.supplier ?? '',
          notes: po.notes ?? '',
          lines,
        }}
      />
    </div>
  )
}
