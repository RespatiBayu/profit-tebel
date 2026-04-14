import { Skeleton } from '@/components/ui/skeleton'

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/50 p-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-3 border-t flex gap-4 items-center">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <Skeleton key={j} className="h-4 w-16" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Skeleton className="h-5 w-32 mb-4" />
      <Skeleton className={`w-full`} style={{ height }} />
    </div>
  )
}

export function DashboardPageSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <KpiCardsSkeleton count={4} />
      <ChartSkeleton height={280} />
      <TableSkeleton rows={5} cols={5} />
    </div>
  )
}
