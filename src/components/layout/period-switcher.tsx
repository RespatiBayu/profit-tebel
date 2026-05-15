'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { parseCsvSelection } from '@/lib/period-filter'
import { usePeriodStore } from '@/lib/stores/period-store'

export function PeriodSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const availableYears = usePeriodStore((s) => s.availableYears)
  const availableMonthsByYear = usePeriodStore((s) => s.availableMonthsByYear)

  const selectedYears = useMemo(
    () =>
      parseCsvSelection(searchParams.get('years') ?? undefined).filter((year) =>
        availableYears.includes(year)
      ),
    [searchParams, availableYears]
  )

  const availableMonths = useMemo(() => {
    const relevantYears = selectedYears.length > 0 ? selectedYears : availableYears
    const set = new Set<string>()
    for (const year of relevantYears) {
      for (const month of availableMonthsByYear[year] ?? []) set.add(month)
    }
    return Array.from(set).sort()
  }, [selectedYears, availableYears, availableMonthsByYear])

  const selectedMonths = useMemo(
    () => parseCsvSelection(searchParams.get('months') ?? undefined),
    [searchParams]
  )

  const effectiveMonths = useMemo(
    () => selectedMonths.filter((month) => availableMonths.includes(month)),
    [selectedMonths, availableMonths]
  )

  function updateSelection(nextYears: string[], nextMonths: string[]) {
    const params = new URLSearchParams(searchParams.toString())

    if (nextYears.length > 0) params.set('years', nextYears.join(','))
    else params.delete('years')

    if (nextMonths.length > 0) params.set('months', nextMonths.join(','))
    else params.delete('months')

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  if (availableYears.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <MultiSelect
        className="w-28 sm:w-32"
        allLabel="Semua Tahun"
        placeholder="Tahun"
        options={availableYears.map((year) => ({ value: year, label: year }))}
        selected={selectedYears}
        onChange={(years) => {
          const relevantYears = years.length > 0 ? years : availableYears
          const allowedMonths = new Set<string>()
          for (const year of relevantYears) {
            for (const month of availableMonthsByYear[year] ?? []) allowedMonths.add(month)
          }
          const nextMonths = effectiveMonths.filter((month) => allowedMonths.has(month))
          updateSelection(years, nextMonths)
        }}
      />
      <MultiSelect
        className="w-32 sm:w-36"
        allLabel="Semua Bulan"
        placeholder="Bulan"
        options={availableMonths.map((month) => ({
          value: month,
          label: new Date(2000, parseInt(month, 10) - 1, 1).toLocaleDateString('id-ID', {
            month: 'long',
          }),
        }))}
        selected={effectiveMonths}
        onChange={(months) => updateSelection(selectedYears, months)}
      />
    </div>
  )
}
