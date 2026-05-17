// ---------------------------------------------------------------------------
// MasterResolver — unified product matching across Order.all, Income OPF, and
// any other data source.
//
// Each master_products row may have up to three identifiers:
//   - marketplace_product_id (canonical Shopee product ID / ads "kode produk")
//   - seller_sku (seller reference from Order.all)
//   - numeric_id (legacy compatibility for older migrations/data)
//   - product_name (fuzzy fallback)
//
// Given any of these on an incoming row, resolve() returns the master row.
// ---------------------------------------------------------------------------

export interface MasterRow {
  id: string
  marketplace_product_id: string
  seller_sku: string | null
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
  private byCanonical = new Map<string, MasterRow>()
  private bySellerSku = new Map<string, MasterRow>()
  private byLegacyNumeric = new Map<string, MasterRow>()
  private byName = new Map<string, MasterRow>()

  constructor(rows: MasterRow[]) {
    for (const r of rows) {
      this.byCanonical.set(r.marketplace_product_id, r)
      if (r.seller_sku) this.bySellerSku.set(r.seller_sku, r)
      if (r.numeric_id && r.numeric_id !== r.marketplace_product_id) {
        this.byLegacyNumeric.set(r.numeric_id, r)
      }
      if (r.product_name) {
        const n = normalizeName(r.product_name)
        const prev = this.byName.get(n)
        // Preference order for byName when multiple masters share a name:
        //   1. one with HPP/packaging > 0 (real data) over zero entries
        //   2. one with seller SKU linked over one without Order.all linkage
        if (!prev) {
          this.byName.set(n, r)
        } else {
          const prevHasHpp = (prev.hpp ?? 0) > 0 || (prev.packaging_cost ?? 0) > 0
          const curHasHpp  = (r.hpp ?? 0) > 0 || (r.packaging_cost ?? 0) > 0
          const prevHasSku = !!prev.seller_sku
          const curHasSku = !!r.seller_sku
          if (
            (curHasHpp && !prevHasHpp) ||
            (curHasHpp === prevHasHpp && curHasSku && !prevHasSku)
          ) {
            this.byName.set(n, r)
          }
        }
      }
    }
  }

  /** Look up a master, preferring direct ID matching and then exact product
   *  name fallback for legacy/placeholder rows.
   *  Strategy:
   *    1. anyId exactly matches canonical product ID, seller_sku, or legacy numeric_id
   *    2. product_name (normalized) match — fallback when IDs are unavailable
   */
  resolve(opts: { anyId?: string | null; productName?: string | null }): MasterRow | undefined {
    if (opts.anyId) {
      const byId =
        this.byCanonical.get(opts.anyId) ??
        this.bySellerSku.get(opts.anyId) ??
        this.byLegacyNumeric.get(opts.anyId)
      if (byId) return byId
    }
    if (opts.productName) {
      const byName = this.byName.get(normalizeName(opts.productName))
      if (byName) return byName
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
    return Array.from(new Set(this.byCanonical.values()))
  }
}
