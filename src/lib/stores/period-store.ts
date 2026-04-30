import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Global period filter (Tahun + Bulan) yang dishare antar halaman dashboard.
 *
 * Pattern:
 *  - Selected values (`selectedYears`, `selectedMonths`) di-persist di
 *    localStorage supaya survive page navigation & refresh.
 *  - Available options (`availableYears`, `availableMonthsByYear`)
 *    di-publish oleh tiap halaman lewat `setAvailable()` via useEffect
 *    berdasarkan data yang dia punya. Tidak di-persist.
 *  - Header `<PeriodSwitcher />` baca available untuk render dropdown,
 *    update selected lewat setter.
 */

interface PeriodState {
  selectedYears: string[]
  selectedMonths: string[]
  availableYears: string[]
  availableMonthsByYear: Record<string, string[]>
  setSelectedYears: (y: string[]) => void
  setSelectedMonths: (m: string[]) => void
  setAvailable: (years: string[], byYear: Record<string, string[]>) => void
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      selectedYears: [],
      selectedMonths: [],
      availableYears: [],
      availableMonthsByYear: {},
      setSelectedYears: (selectedYears) => set({ selectedYears }),
      setSelectedMonths: (selectedMonths) => set({ selectedMonths }),
      setAvailable: (availableYears, availableMonthsByYear) =>
        set({ availableYears, availableMonthsByYear }),
    }),
    {
      name: 'profit-tebel:period-filter',
      storage: createJSONStorage(() => localStorage),
      // Hanya persist user selection. availableYears/MonthsByYear di-derive
      // ulang tiap page mount, jadi nggak perlu disimpan.
      partialize: (s) => ({
        selectedYears: s.selectedYears,
        selectedMonths: s.selectedMonths,
      }),
    }
  )
)
