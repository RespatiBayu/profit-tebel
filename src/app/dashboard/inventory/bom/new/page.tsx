import Link from 'next/link'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { BomBuilderForm } from '@/components/inventory/bom-builder-form'

export default function NewBomPage() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <Link
          href="/dashboard/inventory/bom"
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Buat BOM Baru
          </h1>
          <p className="text-sm text-muted-foreground">Definisikan bahan dan kuantitas untuk satu produk.</p>
        </div>
      </div>

      <BomBuilderForm />
    </div>
  )
}
