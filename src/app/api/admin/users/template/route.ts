import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

export async function GET() {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)

  if (!access || !access.isPrivileged) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Build workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Data (template)
  const templateData = [
    ['email', 'nama'],
    ['user1@email.com', 'Nama User 1'],
    ['user2@email.com', 'Nama User 2'],
    ['user3@email.com', 'Nama User 3'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(templateData)

  // Column widths
  ws['!cols'] = [{ wch: 35 }, { wch: 25 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Import Member')

  // Sheet 2: Petunjuk
  const guideData = [
    ['PETUNJUK PENGISIAN'],
    [''],
    ['1. Isi kolom "email" dengan alamat email user yang akan didaftarkan (WAJIB)'],
    ['2. Isi kolom "nama" dengan nama lengkap user (opsional)'],
    ['3. Jangan ubah nama kolom di baris pertama (email, nama)'],
    ['4. Hapus baris contoh sebelum upload, atau biarkan — sistem akan skip email tidak valid'],
    ['5. Maksimal 200 email per import'],
    ['6. Format file yang diterima: .xlsx, .xls, .csv'],
    [''],
    ['Sistem akan otomatis generate password sementara untuk setiap user.'],
    ['Password dapat diunduh dari hasil import.'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-member.xlsx"',
    },
  })
}
