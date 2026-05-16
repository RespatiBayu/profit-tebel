'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { setAnalyticsTags, trackEvent } from '@/lib/analytics'
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
  Store,
  ShieldCheck,
} from 'lucide-react'
import { StoreSwitcher } from './store-switcher'
import { PeriodSwitcher } from './period-switcher'

const baseNavItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/profit', label: 'Dashboard Analisis', icon: TrendingUp },
  { href: '/dashboard/ads', label: 'Detail Iklan', icon: BarChart3 },
  { href: '/dashboard/roas-calculator', label: 'Kalkulator ROAS', icon: Calculator },
  { href: '/dashboard/products', label: 'Master Produk', icon: Package },
  { href: '/dashboard/stores', label: 'Toko Saya', icon: Store },
  { href: '/dashboard/upload', label: 'Upload Data', icon: Upload },
]

function getNavItems(isAdmin: boolean) {
  return isAdmin
    ? [...baseNavItems, { href: '/dashboard/admin/users', label: 'Admin User', icon: ShieldCheck }]
    : baseNavItems
}

function NavLink({
  item,
  onClick,
}: {
  item: ReturnType<typeof getNavItems>[number]
  onClick?: () => void
}) {
  const pathname = usePathname()
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={() => {
        trackEvent('dashboard_nav_clicked', { destination: item.href })
        onClick?.()
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
      {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
    </Link>
  )
}

function Sidebar({
  isAdmin,
  onClose,
}: {
  isAdmin: boolean
  onClose?: () => void
}) {
  const navItems = getNavItems(isAdmin)

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_12px_28px_-22px_hsl(var(--primary)/0.9)]">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <span className="block font-heading text-base font-semibold">Profit Tebel</span>
          <span className="block text-[11px] text-muted-foreground">Seller analytics</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <p className="text-xs text-muted-foreground px-3">v1.0.0</p>
      </div>
    </div>
  )
}

export default function DashboardShell({
  children,
  user,
  isAdmin,
}: {
  children: React.ReactNode
  user: User
  isAdmin: boolean
}) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    setAnalyticsTags({
      auth_state: 'logged_in',
      user_role: isAdmin ? 'admin' : 'member',
      app_area: 'dashboard',
    })
  }, [isAdmin])

  async function handleLogout() {
    trackEvent('auth_logout_clicked', { surface: 'dashboard' })
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
      <aside className="hidden lg:flex flex-col w-60 border-r border-sidebar-border shrink-0 bg-[hsl(var(--sidebar-background)/0.96)] backdrop-blur-xl">
        <Sidebar isAdmin={isAdmin} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60">
          <Sidebar isAdmin={isAdmin} onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-sidebar-border bg-white/88 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => {
              trackEvent('dashboard_mobile_menu_opened')
              setMobileOpen(true)
            }}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Store switcher + Period filter (global) */}
          <div className="flex-1 flex items-center gap-3 lg:justify-start justify-center flex-wrap">
            <StoreSwitcher />
            <PeriodSwitcher />
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/20">
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
        <MobileBottomNav isAdmin={isAdmin} />
      </div>
    </div>
  )
}

function MobileBottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const navItems = getNavItems(isAdmin)
  return (
    <nav className="lg:hidden border-t border-sidebar-border bg-white/92 backdrop-blur-xl flex items-center justify-around h-16 shrink-0">
      {navItems.slice(0, 5).map((item) => {
        const Icon = item.icon
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => trackEvent('dashboard_nav_clicked', { destination: item.href, surface: 'mobile_bottom_nav' })}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 text-xs rounded-xl transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
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
