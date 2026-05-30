import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { TransactionList } from '@/components/inventory/transaction-list'
function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

type Params = { params: { itemId: string } }

export default async function StockItemPage({ params }: Params) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  // Fetch item info
  const { data: item } = await supabase
    .from('items')
    .select('id, name, sku, type, unit, cost_per_unit')
    .eq('id', params.itemId)
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (!item) notFound()

  // Fetch stock summary
  const { data: stockRows } = await supabase
    .from('item_stock')
    .select('qty_on_hand, avg_cost, last_transaction_date, transaction_count')
    .eq('user_id', access.user.id)
    .eq('item_id', params.itemId)

  // item_stock groups by store_id too — aggregate totals
  const stock = stockRows?.reduce(
    (acc, s) => ({
      qty_on_hand: acc.qty_on_hand + (Number(s.qty_on_hand) || 0),
      avg_cost: s.avg_cost != null ? (s.avg_cost as number) : acc.avg_cost,
      transaction_count: acc.transaction_count + (Number(s.transaction_count) || 0),
    }),
    { qty_on_hand: 0, avg_cost: null as number | null, transaction_count: 0 }
  ) ?? { qty_on_hand: 0, avg_cost: null, transaction_count: 0 }

  const TYPE_LABELS: Record<string, string> = {
    raw_material:  'Bahan Baku',
    semi_finished: 'Setengah Jadi',
    finished_good: 'Barang Jadi',
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inventory/stock"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {item.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABELS[item.type] ?? item.type}
            {item.sku ? ` · SKU: ${item.sku}` : ''}
          </p>
        </div>
      </div>

      {/* Stock summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Stok Tersedia</p>
          <p className={`text-xl font-bold tabular-nums mt-1 ${stock.qty_on_hand <= 0 ? 'text-red-600' : ''}`}>
            {Number(stock.qty_on_hand).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{item.unit}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Avg Cost</p>
          <p className="text-base font-bold tabular-nums mt-1">
            {stock.avg_cost != null ? formatRp(stock.avg_cost) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">per {item.unit}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total Transaksi</p>
          <p className="text-xl font-bold tabular-nums mt-1">{stock.transaction_count}</p>
          <p className="text-xs text-muted-foreground">entri</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Riwayat Mutasi Stok</h2>
        <TransactionList itemId={params.itemId} unit={item.unit} />
      </div>
    </div>
  )
}
