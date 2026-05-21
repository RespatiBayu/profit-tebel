import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

type Params = { params: { id: string } }

// GET /api/inventory/stock-opname/[id] — session detail + lines
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: session, error } = await supabase
    .from('stock_opname_sessions')
    .select('id, name, status, date, notes, finalized_at, created_at, updated_at, store_id')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  // Fetch lines with item info
  const { data: lines, error: linesError } = await supabase
    .from('stock_opname_lines')
    .select('id, item_id, system_qty, actual_qty, notes, item:items!item_id(id, name, unit, type, sku)')
    .eq('session_id', params.id)
    .order('item_id')

  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })

  type RawLine = {
    id: string
    item_id: string
    system_qty: number
    actual_qty: number | null
    notes: string | null
    item: { id: string; name: string; unit: string; type: string; sku: string | null } | null
  }
  const typedLines = ((lines ?? []) as unknown) as RawLine[]

  return NextResponse.json({
    data: {
      ...session,
      lines: typedLines.map((l) => ({
        id:         l.id,
        session_id: params.id,
        item_id:    l.item_id,
        system_qty: Number(l.system_qty),
        actual_qty: l.actual_qty != null ? Number(l.actual_qty) : null,
        notes:      l.notes,
        item:       l.item ?? undefined,
      })),
    },
  })
}

// PATCH /api/inventory/stock-opname/[id] — update session meta atau bulk-update lines
// Body: { name?, notes?, lines?: [{id, actual_qty, notes?}] }
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cek session milik user dan masih draft
  const { data: session } = await supabase
    .from('stock_opname_sessions')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (session.status === 'finalized') {
    return NextResponse.json({ error: 'Sesi sudah difinalisasi, tidak bisa diubah' }, { status: 409 })
  }

  const body = await request.json()
  const { name, notes, lines } = body as {
    name?: string
    notes?: string | null
    lines?: Array<{ id: string; actual_qty: number | null; notes?: string | null }>
  }

  // Update meta jika ada
  if (name !== undefined || notes !== undefined) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) patch.name = name
    if (notes !== undefined) patch.notes = notes

    await supabase
      .from('stock_opname_sessions')
      .update(patch)
      .eq('id', params.id)
  }

  // Update lines satu per satu (upsert)
  if (lines && lines.length > 0) {
    for (const line of lines) {
      await supabase
        .from('stock_opname_lines')
        .update({
          actual_qty: line.actual_qty,
          notes:      line.notes ?? null,
        })
        .eq('id', line.id)
        .eq('session_id', params.id)
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/inventory/stock-opname/[id] — hapus session (hanya draft)
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: session } = await supabase
    .from('stock_opname_sessions')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (session.status === 'finalized') {
    return NextResponse.json({ error: 'Sesi finalized tidak bisa dihapus' }, { status: 409 })
  }

  const { error } = await supabase
    .from('stock_opname_sessions')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
