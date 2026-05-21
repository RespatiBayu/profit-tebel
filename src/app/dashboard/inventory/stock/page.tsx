import { FlaskConical } from 'lucide-react'
import { StockTable } from '@/components/inventory/stock-table'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { notFound } from 'next/navigation'

export default async function StockPage() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access || !access.hasInventoryAccess) notFound()

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold font-heading flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Laporan Stok
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Saldo stok terkini, rata-rata harga beli, dan riwayat mutasi per item.
        </p>
      </div>

      <StockTable />
    </div>
  )
}
