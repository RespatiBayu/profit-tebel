import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enqueueUploadJob } from '@/lib/upload/queue'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const marketplace = (formData.get('marketplace') as string) ?? 'shopee'
    const storeId = (formData.get('storeId') as string | null) ?? null

    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'File harus berformat .xlsx atau .xls' },
        { status: 400 }
      )
    }

    const job = await enqueueUploadJob({
      userId: user.id,
      userEmail: user.email ?? null,
      requestedStoreId: storeId,
      fileName: file.name,
      fileType: 'income',
      marketplace,
      buffer: Buffer.from(await file.arrayBuffer()),
    })

    return NextResponse.json(job, { status: 202 })
  } catch (error) {
    console.error('Income enqueue error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server. Coba lagi.' },
      { status: 500 }
    )
  }
}
