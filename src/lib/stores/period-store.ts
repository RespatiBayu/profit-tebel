import { create } from 'zustand'

interface PeriodState {
  availableYears: string[]
  availableMonthsByYear: Record<string, string[]>
  setAvailable: (years: string[], byYear: Record<string, string[]>) => void
  clearAvailable: () => void
}

export const usePeriodStore = create<PeriodState>()((set) => ({
  availableYears: [],
  availableMonthsByYear: {},
  setAvailable: (availableYears, availableMonthsByYear) =>
    set({ availableYears, availableMonthsByYear }),
  clearAvailable: () => set({ availableYears: [], availableMonthsByYear: {} }),
}))
