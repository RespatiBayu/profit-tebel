import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

/**
 * Diagnostic: POST an XLSX file, get back its structure WITHOUT saving anything.
 *
 *   curl -X POST -F "file=@your-income.xlsx" \
 *     -b "<your-auth-cookie>" \
 *     https://profit-tebel.vercel.app/api/debug/inspect-xlsx
 *
 * Returns: sheet names, dimensions, and first ~15 rows of each sheet so we can
 * see why OPF parsing is finding zero rows.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })

  const sheets: Record<string, {
    rowCount: number
    colCount: number
    firstRows: unknown[][]
    distinctColB: string[]
  }> = {}

  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name]
    const rowsRaw: unknown[][] = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: true })
    const rowsFmt: unknown[][] = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: false })

    // Get distinct values from column B (index 1) — useful to see "Order"/"Sku" markers
    const colBValues = new Set<string>()
    for (const r of rowsRaw) {
      if (r && r[1] != null) {
        const v = String(r[1]).trim()
        if (v && v.length < 50) colBValues.add(v)
      }
    }

    sheets[name] = {
      rowCount: rowsRaw.length,
      colCount: rowsRaw[0]?.length ?? 0,
      // Use formatted rows for first preview (more readable)
      firstRows: rowsFmt.slice(0, 15),
      distinctColB: Array.from(colBValues).slice(0, 30),
    }
  }

  return NextResponse.json({
    sheet_names: wb.SheetNames,
    sheet_count: wb.SheetNames.length,
    sheets,
    note: 'firstRows uses raw=false (formatted strings, what current parser sees). distinctColB shows unique non-empty values in column B — should contain "Order"/"Sku" markers in the OPF sheet.',
  })
}
