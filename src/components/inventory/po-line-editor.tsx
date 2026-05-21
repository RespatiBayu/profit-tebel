'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Item } from '@/types'

export interface PoLineData {
  _key: string
  item_id: string
  item?: Item
  qty_ordered: number
  unit_cost: number
}

interface PoLineEditorProps {
  lines: PoLineData[]
  onChange: (lines: PoLineData[]) => void
  disabled?: boolean
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

// Inline item search — hanya raw_material dan semi_finished (bahan baku / setengah jadi)
function ItemSearchInput({
  value,
  onChange,
  disabled,
}: {
  value: Item | undefined
  onChange: (item: Item) => void
  disabled?: boolean
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const search = useCallback(async (query: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      const res = await fetch(`/api/inventory/items?${params}`)
      const data = await res.json() as { items?: Item[] }
      // Semua tipe bisa dibeli (termasuk finished_good dari vendor)
      setItems(data.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => search(q), 200)
      return () => clearTimeout(t)
    }
  }, [q, open, search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (value?.id) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.name}</p>
          <p className="text-xs text-muted-foreground">{value.unit}</p>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => onChange({ ...value, id: '' } as Item)}
          >
            Ganti
          </Button>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Cari item..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="h-8 text-sm"
        disabled={disabled}
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Mencari...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Tidak ada item. Tambah dulu di Master Item.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(item)
                  setOpen(false)
                  setQ('')
                }}
              >
                <p className="text-sm truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.unit} · {item.type === 'raw_material' ? 'Bahan Mentah' : item.type === 'semi_finished' ? 'Setengah Jadi' : 'Barang Jadi'}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function PoLineEditor({ lines, onChange, disabled = false }: PoLineEditorProps) {
  function addLine() {
    onChange([...lines, {
      _key: `line-${Date.now()}-${Math.random()}`,
      item_id: '',
      item: undefined,
      qty_ordered: 1,
      unit_cost: 0,
    }])
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l._key !== key))
  }

  function updateLine(key: string, patch: Partial<PoLineData>) {
    onChange(lines.map((l) => l._key === key ? { ...l, ...patch } : l))
  }

  const total = lines.reduce((sum, l) => sum + l.qty_ordered * l.unit_cost, 0)

  return (
    <div className="space-y-2">
      {/* Header */}
      {lines.length > 0 && (
        <div className="grid grid-cols-[1fr_96px_120px_32px] gap-2 px-1 text-xs text-muted-foreground font-medium">
          <span>Item</span>
          <span>Qty</span>
          <span>Harga Beli/Unit</span>
          <span />
        </div>
      )}

      {lines.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Belum ada item. Klik &quot;Tambah Item&quot; untuk mulai.</p>
        </div>
      )}

      {lines.map((line) => (
        <div key={line._key} className="grid grid-cols-[1fr_96px_120px_32px] gap-2 items-center">
          {/* Item picker */}
          <ItemSearchInput
            value={line.item?.id ? line.item : undefined}
            onChange={(item) => {
              if (!item.id) {
                updateLine(line._key, { item_id: '', item: undefined })
              } else {
                updateLine(line._key, { item_id: item.id, item, unit_cost: item.cost_per_unit ?? 0 })
              }
            }}
            disabled={disabled}
          />

          {/* Qty */}
          <div className="relative">
            <Input
              type="number"
              min="0"
              step="any"
              value={line.qty_ordered || ''}
              onChange={(e) => updateLine(line._key, { qty_ordered: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm pr-7"
              disabled={disabled}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none truncate">
              {line.item?.unit ?? ''}
            </span>
          </div>

          {/* Unit cost */}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">Rp</span>
            <Input
              type="number"
              min="0"
              step="any"
              value={line.unit_cost || ''}
              onChange={(e) => updateLine(line._key, { unit_cost: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm pl-7"
              disabled={disabled}
            />
          </div>

          {/* Delete */}
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeLine(line._key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : <div />}
        </div>
      ))}

      {/* Subtotal per line + total */}
      {lines.some((l) => l.item_id) && (
        <div className="border-t pt-2 space-y-1">
          {lines.filter((l) => l.item_id).map((l) => (
            <div key={l._key} className="flex justify-between text-xs text-muted-foreground px-1">
              <span className="truncate max-w-[60%]">{l.item?.name ?? l.item_id}</span>
              <span>{formatRp(l.qty_ordered * l.unit_cost)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-semibold px-1 pt-1 border-t">
            <span>Total</span>
            <span className="text-primary">{formatRp(total)}</span>
          </div>
        </div>
      )}

      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 border-dashed"
          onClick={addLine}
        >
          <Plus className="h-4 w-4" />
          Tambah Item
        </Button>
      )}
    </div>
  )
}
