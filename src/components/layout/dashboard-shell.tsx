'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  BarChart3,
  TrendingUp,
  Calculator,
  Package,
  Upload,
  LayoutDashboard,
  Menu,
  LogOut,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/profit', label: 'Analisis Profit', icon: TrendingUp },
  { href: '/dashboard/ads', label: 'Analisis Iklan', icon: BarChart3 },
  { href: '/dashboard/roas-calculator', label: 'Kalkulator ROAS', icon: Calculator },
  { href: '/dashboard/products', label: 'Master Produk', icon: Package },
  { href: '/dashboard/upload', label: 'Upload Data', icon: Upload },
]

function NavLink({
  item,
  onClick,
}: {
  item: (typeof navItems)[0]
  onClick?: () => void
}) {
  const pathname = usePathname()
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
      {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
    </Link>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
        <BarChart3 className="h-6 w-6 text-primary" />
        <span className="font-bold text-lg">Profit Tebel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t shrink-0">
        <p className="text-xs text-muted-foreground px-3">v1.0.0</p>
      </div>
    </div>
  )
}

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode
  user: User
}) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = (user.email ?? 'U')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 border-r shrink-0 bg-card">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60">
          <Sidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Desktop: spacer */}
          <div className="hidden lg:block" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm max-w-[160px] truncate">
                {user.email}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground">Masuk sebagai</p>
                <p className="text-sm font-medium truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive gap-2">
                <LogOut className="h-4 w-4" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <MobileBottomNav />
      </div>
    </div>
  )
}

function MobileBottomNav() {
  const pathname = usePathname()
  return (
    <nav className="lg:hidden border-t bg-card flex items-center justify-around h-16 shrink-0">
      {navItems.slice(0, 5).map((item) => {
        const Icon = item.icon
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 text-xs rounded-lg transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
            <span className="truncate max-w-[56px] text-center leading-tight">
              {item.label.split(' ')[0]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
