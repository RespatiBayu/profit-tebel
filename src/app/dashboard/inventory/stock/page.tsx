import { FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { notFound } from 'next/navigation'
import { StockTable } from '@/components/inventory/stock-table'
import { SyncSaleOutButton } from '@/components/inventory/sync-sale-out-button'

export default async function StockPage() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  // Ambil toko default user (jika hanya satu toko)
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')
    .eq('user_id', access.user.id)
    .limit(5)

  const defaultStoreId = stores?.length === 1 ? stores[0].id : null

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Laporan Stok
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Saldo stok terkini, rata-rata harga beli, dan riwayat mutasi per item.
          </p>
        </div>
        <SyncSaleOutButton storeId={defaultStoreId} />
      </div>

      <StockTable />
    </div>
  )
}
