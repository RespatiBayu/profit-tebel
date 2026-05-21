import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardCheck, Plus, CheckCircle2, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { Button } from '@/components/ui/button'

export default async function StockOpnamePage() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  const { data: sessions } = await supabase
    .from('stock_opname_sessions')
    .select('id, name, status, date, finalized_at, notes')
    .eq('user_id', access.user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  type Session = {
    id: string
    name: string
    status: string
    date: string
    finalized_at: string | null
    notes: string | null
  }
  const rows = (sessions ?? []) as Session[]

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Stock Opname
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hitung stok fisik dan cocokkan dengan data sistem. Selisih otomatis dicatat sebagai penyesuaian.
          </p>
        </div>
        <Link
          href="/dashboard/inventory/stock-opname/new"
          className="inline-flex items-center gap-1.5 shrink-0 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Buat Opname
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Belum ada sesi opname.</p>
          <p className="text-xs text-muted-foreground mt-1">Klik "Buat Opname" untuk mulai.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <Link key={s.id} href={`/dashboard/inventory/stock-opname/${s.id}`}>
              <div className="rounded-xl border bg-card px-4 py-3.5 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer group">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  s.status === 'finalized' ? 'bg-green-50' : 'bg-orange-50'
                }`}>
                  {s.status === 'finalized'
                    ? <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
                    : <Clock className="h-4.5 w-4.5 text-orange-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(s.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                  s.status === 'finalized'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {s.status === 'finalized' ? 'Selesai' : 'Draft'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
