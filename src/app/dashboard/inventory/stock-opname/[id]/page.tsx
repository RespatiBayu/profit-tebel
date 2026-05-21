import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { StockOpnameDetail } from '@/components/inventory/stock-opname-detail'
import type { StockOpnameSession, StockOpnameLine, ItemType } from '@/types'

type Params = { params: { id: string } }

export default async function StockOpnameDetailPage({ params }: Params) {
  const supabase = await createClient()
  const access   = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  // Fetch session
  const { data: sessionRaw } = await supabase
    .from('stock_opname_sessions')
    .select('id, name, status, date, notes, finalized_at, created_at, updated_at, store_id, user_id')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!sessionRaw) notFound()

  // Fetch lines + item info
  const { data: linesRaw } = await supabase
    .from('stock_opname_lines')
    .select('id, item_id, system_qty, actual_qty, notes, item:items!item_id(id, name, unit, type, sku)')
    .eq('session_id', params.id)
    .order('item_id')

  type RawLine = {
    id: string; item_id: string; system_qty: number; actual_qty: number | null; notes: string | null;
    item: { id: string; name: string; unit: string; type: string; sku: string | null } | null
  }
  const typedLines = ((linesRaw ?? []) as unknown) as RawLine[]

  const lines: StockOpnameLine[] = typedLines.map((l) => ({
    id:         l.id,
    session_id: params.id,
    item_id:    l.item_id,
    system_qty: Number(l.system_qty),
    actual_qty: l.actual_qty != null ? Number(l.actual_qty) : null,
    notes:      l.notes,
    item:       l.item ? { ...l.item, type: l.item.type as ItemType } : undefined,
  }))

  const session: StockOpnameSession & { lines: StockOpnameLine[] } = {
    id:           sessionRaw.id as string,
    user_id:      sessionRaw.user_id as string,
    store_id:     (sessionRaw.store_id as string | null) ?? null,
    name:         sessionRaw.name as string,
    status:       sessionRaw.status as 'draft' | 'finalized',
    date:         sessionRaw.date as string,
    notes:        (sessionRaw.notes as string | null) ?? null,
    finalized_at: (sessionRaw.finalized_at as string | null) ?? null,
    created_at:   sessionRaw.created_at as string,
    updated_at:   sessionRaw.updated_at as string,
    lines,
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard/inventory/stock-opname"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{session.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(session.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            {session.notes ? ` · ${session.notes}` : ''}
            {' · '}
            <span className={session.status === 'finalized' ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}>
              {session.status === 'finalized' ? 'Selesai' : 'Draft'}
            </span>
          </p>
        </div>
      </div>

      <StockOpnameDetail session={session} />
    </div>
  )
}
