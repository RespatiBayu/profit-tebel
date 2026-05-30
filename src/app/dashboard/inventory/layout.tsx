import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { InventoryUpgradeGate } from '@/components/layout/inventory-upgrade-gate'

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) redirect('/login')

  // Gate: hanya user dengan subscription Pro aktif yang bisa akses Inventori
  if (!access.hasInventoryAccess) {
    return <InventoryUpgradeGate />
  }

  return <>{children}</>
}
