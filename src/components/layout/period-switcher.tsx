'use client'

import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { usePeriodStore } from '@/lib/stores/period-store'

/**
 * Global period filter di header dashboard. Selevel sama StoreSwitcher.
 * Dropdown options di-derive dari `availableYears` + `availableMonthsByYear`
 * yang di-publish oleh halaman aktif (lihat usePublishAvailablePeriods).
 *
 * Kalau halaman aktif belum publish (misal /dashboard/upload, /master), filter
 * disembunyikan supaya nggak misleading.
 */
export function PeriodSwitcher() {
  const selectedYears = usePeriodStore((s) => s.selectedYears)
  const selectedMonths = usePeriodStore((s) => s.selectedMonths)
  const availableYears = usePeriodStore((s) => s.availableYears)
  const availableMonthsByYear = usePeriodStore((s) => s.availableMonthsByYear)
  const setSelectedYears = usePeriodStore((s) => s.setSelectedYears)
  const setSelectedMonths = usePeriodStore((s) => s.setSelectedMonths)

  // Months yang muncul di dropdown — kalau ada year terpilih, intersect ke
  // bulan yg ada di tahun tersebut. Selain itu union semua bulan available.
  const availableMonths = useMemo(() => {
    const relevantYears = selectedYears.length > 0 ? selectedYears : availableYears
    const set = new Set<string>()
    for (const y of relevantYears) {
      for (const m of availableMonthsByYear[y] ?? []) set.add(m)
    }
    return Array.from(set).sort()
  }, [selectedYears, availableYears, availableMonthsByYear])

  const effectiveMonths = useMemo(
    () => selectedMonths.filter((m) => availableMonths.includes(m)),
    [selectedMonths, availableMonths]
  )

  if (availableYears.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <MultiSelect
        className="w-28 sm:w-32"
        allLabel="Semua Tahun"
        placeholder="Tahun"
        options={availableYears.map((y) => ({ value: y, label: y }))}
        selected={selectedYears}
        onChange={setSelectedYears}
      />
      <MultiSelect
        className="w-32 sm:w-36"
        allLabel="Semua Bulan"
        placeholder="Bulan"
        options={availableMonths.map((m) => ({
          value: m,
          label: new Date(2000, parseInt(m, 10) - 1, 1).toLocaleDateString('id-ID', {
            month: 'long',
          }),
        }))}
        selected={effectiveMonths}
        onChange={setSelectedMonths}
      />
    </div>
  )
}
