import { Package } from 'lucide-react'

export default function ProductsPage() {
  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
        <Package className="h-8 w-8 text-blue-600" />
      </div>
      <h1 className="text-2xl font-bold">Master Produk</h1>
      <p className="text-muted-foreground max-w-sm">
        Input HPP dan biaya packaging per produk. Dikerjakan di Session 3.
      </p>
    </div>
  )
}
