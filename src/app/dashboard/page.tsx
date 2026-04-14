import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  TrendingUp,
  BarChart3,
  Calculator,
  FileSpreadsheet,
  ArrowRight,
  Clock,
} from 'lucide-react'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFileType(fileType: string) {
  const map: Record<string, string> = {
    income: 'Data Penghasilan',
    ads: 'Data Iklan',
  }
  return map[fileType] ?? fileType
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recent uploads
  const { data: recentUploads } = await supabase
    .from('upload_batches')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(5)

  // Fetch quick stats
  const { count: orderCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })

  const { count: adsCount } = await supabase
    .from('ads_data')
    .select('*', { count: 'exact', head: true })

  const { count: productCount } = await supabase
    .from('master_products')
    .select('*', { count: 'exact', head: true })

  const hasData = (orderCount ?? 0) > 0 || (adsCount ?? 0) > 0
  const firstName = user?.email?.split('@')[0] ?? 'Seller'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          Halo, {firstName}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {hasData
            ? 'Berikut ringkasan toko kamu.'
            : 'Upload data pertama kamu untuk mulai analisis profit.'}
        </p>
      </div>

      {/* Empty state */}
      {!hasData && (
        <Card className="border-dashed border-2 bg-muted/20">
          <CardContent className="flex flex-col items-center text-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Belum ada data</h2>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                Upload laporan penghasilan dari Shopee untuk memulai analisis
                profit produk kamu.
              </p>
            </div>
            <Link href="/dashboard/upload">
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Data Sekarang
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick stats (show when has data) */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Order</p>
              <p className="text-2xl font-bold mt-1">{orderCount?.toLocaleString('id-ID')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Data Iklan</p>
              <p className="text-2xl font-bold mt-1">{adsCount?.toLocaleString('id-ID')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Produk Terdaftar</p>
              <p className="text-2xl font-bold mt-1">{productCount?.toLocaleString('id-ID')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold mb-4">Aksi Cepat</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              href: '/dashboard/upload',
              icon: Upload,
              label: 'Upload Data Baru',
              desc: 'XLSX penghasilan atau CSV iklan',
              color: 'bg-blue-100 text-blue-600',
            },
            {
              href: '/dashboard/profit',
              icon: TrendingUp,
              label: 'Analisis Profit',
              desc: 'Lihat profit per produk & trend',
              color: 'bg-green-100 text-green-600',
            },
            {
              href: '/dashboard/ads',
              icon: BarChart3,
              label: 'Analisis Iklan',
              desc: 'SCALE, OPTIMIZE, atau KILL?',
              color: 'bg-orange-100 text-orange-600',
            },
            {
              href: '/dashboard/roas-calculator',
              icon: Calculator,
              label: 'Kalkulator ROAS',
              desc: 'Hitung max budget iklan',
              color: 'bg-purple-100 text-purple-600',
            },
          ].map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${action.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{action.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 mt-0.5" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent uploads */}
      {recentUploads && recentUploads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upload Terakhir</h2>
            <Link href="/dashboard/upload">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                Lihat semua
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {recentUploads.map((upload) => (
                  <div key={upload.id} className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{upload.file_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {upload.marketplace}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {formatFileType(upload.file_type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {upload.record_count} baris
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      <span className="hidden sm:block">{formatDate(upload.uploaded_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
