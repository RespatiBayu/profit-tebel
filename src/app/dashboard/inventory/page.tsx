import Link from 'next/link'
import { Boxes, FlaskConical, ClipboardList, ShoppingCart, ChevronRight, Factory, ClipboardCheck, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

const MENU_ITEMS = [
  {
    href: '/dashboard/inventory/items',
    icon: Boxes,
    title: 'Master Item',
    desc: 'Kelola bahan mentah, setengah jadi, dan barang jadi.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    pro: false,
  },
  {
    href: '/dashboard/inventory/bom',
    icon: ClipboardList,
    title: 'Formula (Resep Produksi)',
    desc: 'Definisikan resep produk dan hitung HPP otomatis.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    pro: true,
  },
  {
    href: '/dashboard/inventory/purchase-orders',
    icon: ShoppingCart,
    title: 'Pembelian (PO)',
    desc: 'Catat pembelian bahan baku dan update stok.',
    color: 'text-green-600',
    bg: 'bg-green-50',
    pro: true,
  },
  {
    href: '/dashboard/inventory/production',
    icon: Factory,
    title: 'Produksi',
    desc: 'Proses konversi bahan ke barang jadi / setengah jadi.',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    pro: true,
  },
  {
    href: '/dashboard/inventory/stock',
    icon: FlaskConical,
    title: 'Laporan Stok',
    desc: 'Pantau saldo stok terkini dan mutasi per item.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    pro: true,
  },
  {
    href: '/dashboard/inventory/stock-opname',
    icon: ClipboardCheck,
    title: 'Stock Opname',
    desc: 'Hitung stok fisik dan sesuaikan selisih otomatis.',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    pro: true,
  },
]

export default async function InventoryPage() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  const hasPro = Boolean(access?.hasInventoryAccess)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold font-heading flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          Inventori & Produksi
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Kelola stok bahan baku, proses produksi, dan hitung HPP otomatis dari Formula.
        </p>
      </div>

      {!hasPro && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 flex items-start gap-2.5">
          <Lock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p>
            Paket <strong>Basic</strong> dapat memakai <strong>Master Item</strong> untuk setup HPP.
            Fitur Formula, Pembelian, Produksi, dan Stok terbuka di paket <strong>Pro</strong>.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon
          const locked = item.pro && !hasPro

          const inner = (
            <Card
              className={`transition-all group ${
                locked
                  ? 'opacity-70 border-dashed'
                  : 'hover:shadow-md hover:border-primary/20 cursor-pointer'
              }`}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-1.5">
                    {item.title}
                    {locked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <Lock className="h-2.5 w-2.5" /> Pro
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.desc}</p>
                </div>
                {locked ? (
                  <Lock className="h-4 w-4 text-amber-500/60 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 shrink-0 transition-colors" />
                )}
              </CardContent>
            </Card>
          )

          // Locked Pro cards still link to the page — the (pro) layout shows the upgrade screen.
          return (
            <Link key={item.href} href={item.href}>
              {inner}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
