import Link from 'next/link'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { PoForm } from '@/components/inventory/po-form'

export default function NewPurchaseOrderPage() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <Link
          href="/dashboard/inventory/purchase-orders"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Buat Purchase Order
          </h1>
          <p className="text-sm text-muted-foreground">Catat pembelian bahan baku dari pemasok.</p>
        </div>
      </div>

      <PoForm />
    </div>
  )
}
