import { Calculator } from 'lucide-react'

export default function RoasCalculatorPage() {
  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
        <Calculator className="h-8 w-8 text-purple-600" />
      </div>
      <h1 className="text-2xl font-bold">Kalkulator ROAS</h1>
      <p className="text-muted-foreground max-w-sm">
        Hitung break-even ROAS dan max budget iklan. Dikerjakan di Session 6.
      </p>
    </div>
  )
}
