import { TrendingUp } from 'lucide-react'

export default function ProfitPage() {
  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <TrendingUp className="h-8 w-8 text-green-600" />
      </div>
      <h1 className="text-2xl font-bold">Analisis Profit</h1>
      <p className="text-muted-foreground max-w-sm">
        Fitur ini akan tersedia setelah kamu upload data penghasilan. Dikerjakan di Session 4.
      </p>
    </div>
  )
}
