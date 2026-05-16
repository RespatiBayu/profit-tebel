'use client'

import * as React from 'react'
import { ChevronDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

interface Props {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  allLabel?: string
  className?: string
  /** Label dipendekkan jadi count kalau selected lebih dari N */
  collapseAfter?: number
}

/**
 * Dropdown multi-select dengan checkbox. Kalau `selected` kosong, trigger nunjukin
 * allLabel (default "Semua"). Kalau banyak terpilih, di-collapse jadi "N dipilih".
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  allLabel = 'Semua',
  className,
  collapseAfter = 2,
}: Props) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const clear = () => onChange([])
  const selectAll = () => onChange(options.map((o) => o.value))

  const label = (() => {
    if (selected.length === 0) return placeholder ?? allLabel
    // Note: jangan collapse jadi allLabel ketika selected.length === options.length.
    // User explicit pick (misal "2026") harus tetap kelihatan walaupun kebetulan
    // di halaman lain available options-nya cuma 2026 → biar nggak misleading
    // "filter direset" padahal masih kefilter.
    if (selected.length > collapseAfter) return `${selected.length} dipilih`
    return options
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
      .join(', ')
  })()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'h-9 text-xs px-3 py-1 rounded-xl border border-input bg-white/88 hover:border-primary/18 hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 font-normal shadow-[0_10px_28px_-24px_rgba(15,23,42,0.45)] transition-[border-color,background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
          className
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-auto min-w-[10rem]">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground border-b mb-1">
          <button
            type="button"
            onClick={selectAll}
            className="hover:text-foreground transition-colors"
          >
            Pilih Semua
          </button>
          <button
            type="button"
            onClick={clear}
            className="hover:text-foreground transition-colors"
          >
            Reset
          </button>
        </div>
        {options.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">Tidak ada opsi</div>
        )}
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value)
          return (
            <DropdownMenuItem
              key={opt.value}
              closeOnClick={false}
              onClick={(e) => {
                e.preventDefault()
                toggle(opt.value)
              }}
              className="text-xs cursor-pointer flex items-center gap-2 pl-2"
            >
              <span
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                  isSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40'
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">{opt.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
