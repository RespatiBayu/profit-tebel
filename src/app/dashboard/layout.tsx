import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/layout/dashboard-shell'
import UpgradeGate from '@/components/layout/upgrade-gate'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch payment status from profiles table
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_paid')
    .eq('id', user.id)
    .maybeSingle()

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  const isAdmin = adminEmails.includes(user.email ?? '')
  const isPaid = isAdmin || (profile?.is_paid ?? false)

  return (
    <DashboardShell user={user}>
      {isPaid ? children : <UpgradeGate />}
    </DashboardShell>
  )
}
