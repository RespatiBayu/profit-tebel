'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { buildDashboardHref } from '@/lib/dashboard-filters'

type DashboardLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string
}

export function DashboardLink({ href, ...props }: DashboardLinkProps) {
  const searchParams = useSearchParams()

  return <Link href={buildDashboardHref(href, searchParams)} {...props} />
}
