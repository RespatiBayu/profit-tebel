import { Upload } from 'lucide-react'

export default function UploadPage() {
  return (
    <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
        <Upload className="h-8 w-8 text-blue-600" />
      </div>
      <h1 className="text-2xl font-bold">Upload Data</h1>
      <p className="text-muted-foreground max-w-sm">
        Upload XLSX penghasilan atau CSV iklan dari marketplace kamu. Dikerjakan di Session 3.
      </p>
    </div>
  )
}
