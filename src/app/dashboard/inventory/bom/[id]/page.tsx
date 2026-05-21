import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { BomBuilderForm } from '@/components/inventory/bom-builder-form'
import type { BomLineData } from '@/components/inventory/bom-line-editor'
import type { Item } from '@/types'

type Params = { params: { id: string } }

export default async function EditBomPage({ params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  const { data: bom } = await supabase
    .from('bom_headers')
    .select(`
      id, output_item_id, output_qty, name, notes, is_active,
      output_item:items!output_item_id(id, name, type, unit, cost_per_unit),
      bom_lines(id, input_item_id, qty_per_output, sort_order, notes,
        input_item:items!input_item_id(id, name, type, unit, cost_per_unit))
    `)
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!bom) notFound()

  const outItem = (bom.output_item as unknown) as Item | null
  if (!outItem) notFound()

  // Ambil avg_cost untuk tiap input item
  const lineItems = (bom.bom_lines as unknown) as Array<{
    id: string
    input_item_id: string
    qty_per_output: number
    sort_order: number
    notes: string | null
    input_item: Item | null
  }> ?? []

  const itemIds = lineItems.map((l) => l.input_item_id).filter(Boolean)
  const stockMap = new Map<string, number | null>()
  if (itemIds.length > 0) {
    const { data: stocks } = await supabase
      .from('item_stock')
      .select('item_id, avg_cost')
      .in('item_id', itemIds)
      .eq('user_id', access.user.id)
    for (const s of stocks ?? []) {
      stockMap.set(s.item_id, s.avg_cost ?? null)
    }
  }

  const sortedLines = [...lineItems]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l): BomLineData => ({
      _key: l.id,
      input_item_id: l.input_item_id,
      item: l.input_item ? { ...l.input_item, avg_cost: stockMap.get(l.input_item_id) ?? undefined } as Item : undefined,
      qty_per_output: l.qty_per_output,
      sort_order: l.sort_order ?? 0,
      notes: l.notes ?? '',
    }))

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <Link
          href="/dashboard/inventory/bom"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Edit BOM
          </h1>
          <p className="text-sm text-muted-foreground">{bom.name ?? outItem.name}</p>
        </div>
      </div>

      <BomBuilderForm
        bomId={bom.id}
        initialData={{
          output_item: outItem,
          output_qty: bom.output_qty,
          name: bom.name ?? '',
          notes: bom.notes ?? '',
          lines: sortedLines,
        }}
      />
    </div>
  )
}
