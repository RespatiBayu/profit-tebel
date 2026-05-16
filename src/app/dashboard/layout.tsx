import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/layout/dashboard-shell'
import UpgradeGate from '@/components/layout/upgrade-gate'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) {
    redirect('/login')
  }

  return (
    <DashboardShell user={access.user} userRole={access.role}>
      {access.isPaid ? children : <UpgradeGate />}
    </DashboardShell>
  )
}
