import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import ProfitDashboard from '@/components/profit/profit-dashboard'
import type { DbOrder, DbOrderProduct, MasterProduct } from '@/types'

export default async function ProfitPage() {
  const supabase = await createClient()

  const [
    { data: orders },
    { data: orderProducts },
    { data: masterProducts },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false }),
    supabase
      .from('order_products')
      .select('*'),
    supabase
      .from('master_products')
      .select('*'),
  ])

  const typedOrders = (orders ?? []) as DbOrder[]
  const typedOrderProducts = (orderProducts ?? []) as DbOrderProduct[]
  const typedMasterProducts = (masterProducts ?? []) as MasterProduct[]

  if (typedOrders.length === 0) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Upload className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Belum ada data penghasilan</h1>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Upload file XLSX income dari Shopee Seller Center untuk mulai analisis profit.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const noHppCount = typedMasterProducts.filter((p) => !p.hpp || p.hpp === 0).length

  return (
    <ProfitDashboard
      orders={typedOrders}
      orderProducts={typedOrderProducts}
      masterProducts={typedMasterProducts}
      noHppCount={noHppCount}
    />
  )
}
