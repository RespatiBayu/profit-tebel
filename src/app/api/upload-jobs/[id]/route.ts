import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processUploadJobForUser } from '@/lib/upload/queue'

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const job = await processUploadJobForUser(id, user.id)

  if (!job) {
    return NextResponse.json({ error: 'Job tidak ditemukan' }, { status: 404 })
  }

  return NextResponse.json(job)
}
