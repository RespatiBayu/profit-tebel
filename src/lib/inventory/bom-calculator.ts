/**
 * BOM HPP Calculator — Multi-level recursive with cycle detection
 *
 * Cost priority per input item:
 * 1. avg_cost dari item_stock view (harga beli terakhir moving average)
 * 2. cost_per_unit dari items table (harga manual fallback)
 * 3. 0 jika tidak ada data
 */

export interface BomLineInput {
  input_item_id: string
  qty_per_output: number
}

export interface BomHeaderInput {
  id: string
  output_item_id: string
  output_qty: number
  lines: BomLineInput[]
}

export interface ItemCostData {
  id: string
  cost_per_unit: number
  avg_cost: number | null
  type: string  // 'raw_material' | 'semi_finished' | 'finished_good'
}

export interface BomCalcResult {
  hpp_per_unit: number
  total_material_cost: number   // hpp_per_unit × output_qty
  breakdown: BomLineBreakdown[]
  has_cycle: boolean
  cycle_path?: string[]
  missing_items: string[]       // item_id yang tidak ada di itemMap
}

export interface BomLineBreakdown {
  input_item_id: string
  qty_per_output: number
  unit_cost: number             // resolved cost per unit (from avg_cost or cost_per_unit)
  cost_source: 'avg_cost' | 'manual' | 'recursive' | 'zero'
  line_total: number            // qty_per_output × unit_cost
  is_semi_finished: boolean
  sub_hpp?: number              // HPP per unit of this semi_finished item (recursive)
}

/**
 * Hitung HPP untuk satu BOM secara rekursif.
 * @param bomId - BOM yang sedang dihitung
 * @param bomMap - Map semua BOM yang ada (id → BomHeaderInput)
 * @param itemMap - Map semua item cost data (id → ItemCostData)
 * @param visitStack - Set item_id yang sedang dalam proses rekursi (cycle detection)
 */
export function calculateBomHpp(
  bomId: string,
  bomMap: Map<string, BomHeaderInput>,
  itemMap: Map<string, ItemCostData>,
  visitStack: Set<string> = new Set()
): BomCalcResult {
  const bom = bomMap.get(bomId)
  if (!bom) {
    return { hpp_per_unit: 0, total_material_cost: 0, breakdown: [], has_cycle: false, missing_items: [] }
  }

  // Cycle detection: cek apakah output_item_id sudah dalam stack
  if (visitStack.has(bom.output_item_id)) {
    return {
      hpp_per_unit: 0,
      total_material_cost: 0,
      breakdown: [],
      has_cycle: true,
      cycle_path: Array.from(visitStack).concat(bom.output_item_id),
      missing_items: [],
    }
  }

  const newStack = new Set(visitStack)
  newStack.add(bom.output_item_id)

  const breakdown: BomLineBreakdown[] = []
  const missingItems: string[] = []
  let totalCost = 0

  for (const line of bom.lines) {
    const item = itemMap.get(line.input_item_id)

    if (!item) {
      missingItems.push(line.input_item_id)
      breakdown.push({
        input_item_id: line.input_item_id,
        qty_per_output: line.qty_per_output,
        unit_cost: 0,
        cost_source: 'zero',
        line_total: 0,
        is_semi_finished: false,
      })
      continue
    }

    const isSemiFinished = item.type === 'semi_finished'
    let unitCost = 0
    let costSource: BomLineBreakdown['cost_source'] = 'zero'
    let subHpp: number | undefined

    if (isSemiFinished) {
      // Cari BOM untuk item ini
      const subBom = Array.from(bomMap.values()).find(
        (b) => b.output_item_id === line.input_item_id
      )
      if (subBom) {
        const subResult = calculateBomHpp(subBom.id, bomMap, itemMap, newStack)
        if (subResult.has_cycle) {
          return {
            hpp_per_unit: 0,
            total_material_cost: 0,
            breakdown: [],
            has_cycle: true,
            cycle_path: subResult.cycle_path,
            missing_items: [],
          }
        }
        unitCost = subResult.hpp_per_unit
        costSource = 'recursive'
        subHpp = subResult.hpp_per_unit
      } else {
        // Tidak ada BOM → pakai avg_cost atau manual
        unitCost = item.avg_cost ?? item.cost_per_unit ?? 0
        costSource = item.avg_cost != null ? 'avg_cost' : item.cost_per_unit > 0 ? 'manual' : 'zero'
      }
    } else {
      // Raw material / finished_good — pakai avg_cost atau manual
      unitCost = item.avg_cost ?? item.cost_per_unit ?? 0
      costSource = item.avg_cost != null ? 'avg_cost' : item.cost_per_unit > 0 ? 'manual' : 'zero'
    }

    const lineTotal = line.qty_per_output * unitCost
    totalCost += lineTotal

    breakdown.push({
      input_item_id: line.input_item_id,
      qty_per_output: line.qty_per_output,
      unit_cost: unitCost,
      cost_source: costSource,
      line_total: lineTotal,
      is_semi_finished: isSemiFinished,
      sub_hpp: subHpp,
    })
  }

  // HPP per unit = total biaya bahan / qty output per proses
  const hppPerUnit = bom.output_qty > 0 ? totalCost / bom.output_qty : 0

  return {
    hpp_per_unit: Math.round(hppPerUnit * 100) / 100,
    total_material_cost: Math.round(totalCost * 100) / 100,
    breakdown,
    has_cycle: false,
    missing_items: missingItems,
  }
}

/**
 * Hitung HPP untuk semua BOM sekaligus.
 * Berguna untuk bulk recalculate setelah update harga bahan.
 */
export function calculateAllBomHpp(
  boms: BomHeaderInput[],
  itemCosts: ItemCostData[]
): Map<string, BomCalcResult> {
  const bomMap = new Map(boms.map((b) => [b.id, b]))
  const itemMap = new Map(itemCosts.map((i) => [i.id, i]))
  const results = new Map<string, BomCalcResult>()

  for (const bom of boms) {
    results.set(bom.id, calculateBomHpp(bom.id, bomMap, itemMap))
  }

  return results
}
