import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) {
    redirect('/login')
  }

  if (!access.isPrivileged) {
    notFound()
  }

  return children
}
