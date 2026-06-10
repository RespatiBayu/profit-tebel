import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { InventoryUpgradeGate } from '@/components/layout/inventory-upgrade-gate'

// Gate khusus fitur Pro: Formula, Pembelian, Produksi, Laporan Stok, Stock Opname.
// Master Item (dan halaman landing Inventori) tetap terbuka untuk paket Basic.
export default async function InventoryProLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) redirect('/login')
  if (!access.hasInventoryAccess) {
    const s = access.subscription
    const isPaidBasic = s.tier === 'basic' && !s.isTrial && s.isActive
    return <InventoryUpgradeGate isPaidBasic={isPaidBasic} />
  }

  return <>{children}</>
}
