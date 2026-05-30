import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserAccess, getManagedRole } from '@/lib/roles'
import * as XLSX from 'xlsx'
import { randomBytes } from 'crypto'

function genPassword() {
  // 10-char alphanumeric random password
  return randomBytes(8).toString('base64url').slice(0, 10)
}

function extractEmails(workbook: XLSX.WorkBook): Array<{ email: string; name: string }> {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  // Cari kolom email (case-insensitive match pada header "email", "Email", "EMAIL")
  const results: Array<{ email: string; name: string }> = []

  for (const row of rows) {
    const keys = Object.keys(row)
    const emailKey = keys.find((k) => k.trim().toLowerCase() === 'email') ?? keys[0]
    const nameKey  = keys.find((k) => ['nama', 'name', 'full_name', 'fullname'].includes(k.trim().toLowerCase())) ?? ''

    const rawEmail = String(row[emailKey] ?? '').trim().toLowerCase()
    const rawName  = nameKey ? String(row[nameKey] ?? '').trim() : ''

    if (rawEmail && rawEmail.includes('@')) {
      results.push({ email: rawEmail, name: rawName })
    }
  }

  return results
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.isPrivileged) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const managedRole = getManagedRole(access.role)
  if (!managedRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Request harus multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'File Excel wajib diupload' }, { status: 400 })
  }

  // Parse Excel
  let entries: Array<{ email: string; name: string }>
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    entries = extractEmails(workbook)
  } catch {
    return NextResponse.json({ error: 'Gagal membaca file Excel. Pastikan format .xlsx atau .xls.' }, { status: 400 })
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Tidak ditemukan email valid di file. Pastikan ada kolom "email".' }, { status: 400 })
  }

  if (entries.length > 200) {
    return NextResponse.json({ error: 'Maksimal 200 email per import.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const results: Array<{
    email: string
    name: string
    status: 'success' | 'error'
    tempPassword?: string
    error?: string
  }> = []

  for (const entry of entries) {
    const tempPassword = genPassword()
    try {
      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email: entry.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: entry.name ? { full_name: entry.name } : undefined,
      })

      if (createErr || !created.user) {
        results.push({ email: entry.email, name: entry.name, status: 'error', error: createErr?.message ?? 'Gagal membuat akun' })
        continue
      }

      const userId = created.user.id
      const { error: profileErr } = await service
        .from('profiles')
        .upsert({
          id: userId,
          email: entry.email,
          full_name: entry.name || entry.email.split('@')[0],
          is_paid: false,
          role: managedRole,
          created_by_id: access.user.id,
        }, { onConflict: 'id' })

      if (profileErr) {
        await service.auth.admin.deleteUser(userId)
        results.push({ email: entry.email, name: entry.name, status: 'error', error: profileErr.message })
        continue
      }

      results.push({ email: entry.email, name: entry.name, status: 'success', tempPassword })
    } catch (err) {
      results.push({
        email: entry.email,
        name: entry.name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    total: entries.length,
    success: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  })
}
