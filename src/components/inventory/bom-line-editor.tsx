'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, GripVertical, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Item } from '@/types'

export interface BomLineData {
  _key: string           // local unique key untuk React
  input_item_id: string
  item?: Item            // data item (untuk display)
  qty_per_output: number
  sort_order: number
  notes: string
}

interface BomLineEditorProps {
  lines: BomLineData[]
  outputItemId: string   // untuk cegah pilih item yang sama dengan output
  onChange: (lines: BomLineData[]) => void
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

const TYPE_LABEL: Record<string, string> = {
  raw_material: 'Mentah',
  semi_finished: 'Setengah Jadi',
  finished_good: 'Jadi',
}

const TYPE_COLOR: Record<string, string> = {
  raw_material: 'secondary',
  semi_finished: 'outline',
  finished_good: 'default',
}

// Komponen search + dropdown untuk pilih item
function ItemSearchInput({
  value,
  outputItemId,
  onChange,
}: {
  value: Item | undefined
  outputItemId: string
  onChange: (item: Item) => void
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
      // Filter out output item (tidak boleh jadi bahan sendiri)
      setItems((data.items ?? []).filter((i) => i.id !== outputItemId))
    } finally {
      setLoading(false)
    }
  }, [outputItemId])

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

  if (value) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.name}</p>
          <p className="text-xs text-muted-foreground">{value.unit} · {TYPE_LABEL[value.type] ?? value.type}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => onChange({ ...value, id: '' } as Item)}
        >
          Ganti
        </Button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Cari nama item..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="h-8 text-sm"
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
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(item)
                  setOpen(false)
                  setQ('')
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.unit} · {TYPE_LABEL[item.type] ?? item.type}</p>
                </div>
                <Badge
                  variant={TYPE_COLOR[item.type] as 'default' | 'secondary' | 'outline'}
                  className="text-[10px] shrink-0"
                >
                  {TYPE_LABEL[item.type] ?? item.type}
                </Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function BomLineEditor({ lines, outputItemId, onChange }: BomLineEditorProps) {
  function addLine() {
    const newLine: BomLineData = {
      _key: `line-${Date.now()}-${Math.random()}`,
      input_item_id: '',
      item: undefined,
      qty_per_output: 1,
      sort_order: lines.length,
      notes: '',
    }
    onChange([...lines, newLine])
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l._key !== key).map((l, i) => ({ ...l, sort_order: i })))
  }

  function updateLine(key: string, patch: Partial<BomLineData>) {
    onChange(lines.map((l) => l._key === key ? { ...l, ...patch } : l))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...lines]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    onChange(next.map((l, i) => ({ ...l, sort_order: i })))
  }

  function moveDown(idx: number) {
    if (idx === lines.length - 1) return
    const next = [...lines]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    onChange(next.map((l, i) => ({ ...l, sort_order: i })))
  }

  return (
    <div className="space-y-2">
      {lines.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Belum ada bahan. Klik &quot;Tambah Bahan&quot; untuk mulai.</p>
        </div>
      )}

      {lines.map((line, idx) => (
        <div key={line._key} className="border rounded-xl p-3 space-y-2 bg-background">
          <div className="flex items-start gap-2">
            {/* Drag handle / order buttons */}
            <div className="flex flex-col gap-0.5 pt-1 shrink-0">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === lines.length - 1}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Item picker */}
            <div className="flex-1 min-w-0">
              <ItemSearchInput
                value={line.item?.id ? line.item : undefined}
                outputItemId={outputItemId}
                onChange={(item) => {
                  if (!item.id) {
                    // Reset
                    updateLine(line._key, { input_item_id: '', item: undefined })
                  } else {
                    updateLine(line._key, { input_item_id: item.id, item })
                  }
                }}
              />
            </div>

            {/* Qty */}
            <div className="shrink-0 w-28">
              <div className="relative">
                <Input
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={line.qty_per_output}
                  onChange={(e) => updateLine(line._key, { qty_per_output: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-sm pr-8"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground truncate">
                  {line.item?.unit ?? 'unit'}
                </span>
              </div>
            </div>

            {/* Delete */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeLine(line._key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Cost preview per line */}
          {line.item?.id && (
            <div className="ml-7 flex items-center gap-2 text-xs text-muted-foreground">
              {line.item.type === 'semi_finished' ? (
                <span className="text-purple-600">⚙ Setengah jadi — HPP dihitung rekursif dari BOM-nya</span>
              ) : (
                <>
                  <span>Harga: {formatRp(line.item.avg_cost ?? line.item.cost_per_unit ?? 0)}/{line.item.unit}</span>
                  {line.item.avg_cost == null && line.item.cost_per_unit > 0 && (
                    <span className="text-amber-500">(manual)</span>
                  )}
                  {line.item.avg_cost == null && !line.item.cost_per_unit && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Belum ada harga
                    </span>
                  )}
                  <span className="text-foreground font-medium ml-auto">
                    = {formatRp((line.item.avg_cost ?? line.item.cost_per_unit ?? 0) * line.qty_per_output)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-2 border-dashed"
        onClick={addLine}
      >
        <Plus className="h-4 w-4" />
        Tambah Bahan
      </Button>
    </div>
  )
}
