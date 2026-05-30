import Link from 'next/link'
import { ArrowLeft, Factory } from 'lucide-react'
import { ProductionOrderForm } from '@/components/inventory/production-order-form'

export default function NewProductionOrderPage() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <Link
          href="/dashboard/inventory/production"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            Buat Production Order
          </h1>
          <p className="text-sm text-muted-foreground">Pilih Formula dan tentukan qty yang akan diproduksi.</p>
        </div>
      </div>

      <ProductionOrderForm />
    </div>
  )
}
