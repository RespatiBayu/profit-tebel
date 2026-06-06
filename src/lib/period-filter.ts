import type { AvailablePeriods } from '@/types'

interface PeriodRangeLike {
  period_start?: string | Date | null
  period_end?: string | Date | null
}

function isYear(value: string): boolean {
  return /^\d{4}$/.test(value)
}

function isMonth(value: string): boolean {
  return /^(0[1-9]|1[0-2])$/.test(value)
}

export function parseCsvSelection(value: string | undefined): string[] {
  if (!value) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

export function shiftYearMonth(period: string, delta: number): string {
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const totalMonths = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = ((totalMonths % 12) + 12) % 12 + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

function monthStart(period: string): string {
  return `${period}-01`
}

function nextMonthStart(period: string): string {
  return `${shiftYearMonth(period, 1)}-01`
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return null
}

function expandRangeToPeriods(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string[] {
  const startIso = toIsoDate(start ?? end)
  const endIso = toIsoDate(end ?? start)
  if (!startIso || !endIso) return []

  const startPeriod = startIso.slice(0, 7)
  const endPeriod = endIso.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(startPeriod) || !/^\d{4}-\d{2}$/.test(endPeriod)) return []

  const periods: string[] = []
  let cursor = startPeriod
  while (cursor <= endPeriod) {
    periods.push(cursor)
    cursor = shiftYearMonth(cursor, 1)
  }
  return periods
}

export function buildAvailablePeriods(ranges: PeriodRangeLike[]): AvailablePeriods {
  const monthsByYear = new Map<string, Set<string>>()

  for (const range of ranges) {
    for (const period of expandRangeToPeriods(range.period_start, range.period_end)) {
      const [year, month] = period.split('-')
      const months = monthsByYear.get(year) ?? new Set<string>()
      months.add(month)
      monthsByYear.set(year, months)
    }
  }

  const years = Array.from(monthsByYear.keys()).sort((a, b) => b.localeCompare(a))
  const out: Record<string, string[]> = {}
  for (const year of years) {
    out[year] = Array.from(monthsByYear.get(year) ?? []).sort()
  }

  return { years, monthsByYear: out }
}

export function sanitizeSelection(
  available: AvailablePeriods,
  requestedYears: string[],
  requestedMonths: string[],
) {
  const selectedYears = requestedYears.filter((year) => isYear(year) && available.years.includes(year))
  const relevantYears = selectedYears.length > 0 ? selectedYears : available.years

  const allowedMonths = new Set<string>()
  for (const year of relevantYears) {
    for (const month of available.monthsByYear[year] ?? []) {
      allowedMonths.add(month)
    }
  }

  const effectiveMonths = requestedMonths.filter((month) => isMonth(month) && allowedMonths.has(month))
  const selectedPeriods: string[] = []
  for (const year of relevantYears) {
    for (const month of available.monthsByYear[year] ?? []) {
      if (effectiveMonths.length === 0 || effectiveMonths.includes(month)) {
        selectedPeriods.push(`${year}-${month}`)
      }
    }
  }

  return {
    selectedYears,
    effectiveMonths,
    selectedPeriods,
    hasFilter: selectedYears.length > 0 || effectiveMonths.length > 0,
  }
}

export function buildPeriodOrFilter(column: string, periods: string[]): string | null {
  const uniquePeriods = Array.from(new Set(periods)).sort()
  if (uniquePeriods.length === 0) return null

  return uniquePeriods
    .map((period) => `and(${column}.gte.${monthStart(period)},${column}.lt.${nextMonthStart(period)})`)
    .join(',')
}
