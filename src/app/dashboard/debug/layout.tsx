import { notFound, redirect } from 'next/navigation'
import { isAdminEmail } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export default async function DebugLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!isAdminEmail(user.email)) {
    notFound()
  }

  return children
}
