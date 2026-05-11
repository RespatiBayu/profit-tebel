// ---------------------------------------------------------------------------
// MasterResolver — unified product matching across Order.all, Income OPF, and
// any other data source.
//
// Each master_products row may have up to three identifiers:
//   - marketplace_product_id (canonical, usually seller SKU after migration)
//   - numeric_id (Shopee's internal numeric ID, auto-populated from income OPF)
//   - product_name (fuzzy fallback)
//
// Given any of these on an incoming row, resolve() returns the master row.
// ---------------------------------------------------------------------------

export interface MasterRow {
  id: string
  marketplace_product_id: string
  numeric_id: string | null
  product_name: string | null
  hpp: number
  packaging_cost: number
}

/** Normalize for fuzzy name matching: lowercase, collapse whitespace,
 *  normalize Unicode dashes (en-dash, em-dash, etc) to plain hyphen. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export class MasterResolver {
  private bySku = new Map<string, MasterRow>()
  private byNumeric = new Map<string, MasterRow>()
  private byName = new Map<string, MasterRow>()

  constructor(rows: MasterRow[]) {
    for (const r of rows) {
      this.bySku.set(r.marketplace_product_id, r)
      if (r.numeric_id) this.byNumeric.set(r.numeric_id, r)
      if (r.product_name) {
        const n = normalizeName(r.product_name)
        // First occurrence wins (deterministic)
        if (!this.byName.has(n)) this.byName.set(n, r)
      }
    }
  }

  /** Look up a master by any combination of identifiers. Tries:
   *   1. anyId exactly matches marketplace_product_id OR numeric_id
   *   2. product_name (normalized) match
   */
  resolve(opts: { anyId?: string | null; productName?: string | null }): MasterRow | undefined {
    if (opts.anyId) {
      const m = this.bySku.get(opts.anyId) ?? this.byNumeric.get(opts.anyId)
      if (m) return m
    }
    if (opts.productName) {
      const m = this.byName.get(normalizeName(opts.productName))
      if (m) return m
    }
    return undefined
  }

  /** HPP lookup helper — returns 0 when no master found. */
  hppFor(opts: { anyId?: string | null; productName?: string | null }): { hpp: number; packaging: number } {
    const m = this.resolve(opts)
    return m
      ? { hpp: m.hpp ?? 0, packaging: m.packaging_cost ?? 0 }
      : { hpp: 0, packaging: 0 }
  }

  /** Return all master rows (for iteration). */
  all(): MasterRow[] {
    return Array.from(new Set(this.bySku.values()))
  }
}
