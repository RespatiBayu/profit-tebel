import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'
import { redirect } from 'next/navigation'

// Layout root Inventori: hanya cek autentikasi.
// Master Item + halaman landing terbuka untuk paket Basic.
// Fitur Pro (Formula, Pembelian, Produksi, Laporan Stok, Stock Opname)
// di-gate terpisah di folder (pro)/layout.tsx.
export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) redirect('/login')

  return <>{children}</>
}
