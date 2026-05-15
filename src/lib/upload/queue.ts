import { createAdminClient } from '@/lib/supabase/admin'
import type { UploadFileType, UploadJobResult, UploadJobStatusResponse } from '@/types'
import { processUploadJobByType } from './processors'

type UploadJobRow = {
  id: string
  user_id: string
  requested_store_id: string | null
  resolved_store_id: string | null
  user_email: string | null
  file_name: string
  file_type: UploadFileType
  marketplace: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  progress_label: string | null
  payload_base64: string
  payload_size_bytes: number
  result: UploadJobResult | null
  error_message: string | null
  attempts: number
  worker_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

const STALE_JOB_MINUTES = 15
const workerId = `upload-worker-${Math.random().toString(36).slice(2, 10)}`
let drainPromise: Promise<void> | null = null

function nowIso() {
  return new Date().toISOString()
}

function serializeJob(row: UploadJobRow): UploadJobStatusResponse {
  return {
    id: row.id,
    status: row.status,
    progress: row.progress,
    progressLabel: row.progress_label,
    fileType: row.file_type,
    fileName: row.file_name,
    result: row.result,
    error: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

async function updateJobProgress(id: string, progress: number, label: string) {
  const supabase = createAdminClient()
  await supabase
    .from('upload_jobs')
    .update({
      progress,
      progress_label: label,
      updated_at: nowIso(),
    })
    .eq('id', id)
}

async function requeueStaleJobs() {
  const supabase = createAdminClient()
  const staleBefore = new Date(Date.now() - STALE_JOB_MINUTES * 60_000).toISOString()
  const { error } = await supabase
    .from('upload_jobs')
    .update({
      status: 'queued',
      progress_label: 'Mengantre ulang setelah worker terputus',
      worker_id: null,
      started_at: null,
      updated_at: nowIso(),
    })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)

  if (error) {
    console.error('Failed to requeue stale upload jobs:', error)
  }
}

async function claimNextUploadJob() {
  const supabase = createAdminClient()
  const { data: candidates, error } = await supabase
    .from('upload_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Failed to fetch queued upload jobs:', error)
    return null
  }

  for (const candidate of (candidates ?? []) as UploadJobRow[]) {
    const attempts = (candidate.attempts ?? 0) + 1
    const { data: claimed, error: claimError } = await supabase
      .from('upload_jobs')
      .update({
        status: 'processing',
        progress: Math.max(candidate.progress ?? 0, 5),
        progress_label: 'Memulai proses upload',
        worker_id: workerId,
        attempts,
        started_at: candidate.started_at ?? nowIso(),
        error_message: null,
        updated_at: nowIso(),
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle()

    if (claimError) {
      console.error('Failed to claim upload job:', claimError)
      continue
    }

    if (claimed) {
      return claimed as UploadJobRow
    }
  }

  return null
}

async function processClaimedUploadJob(job: UploadJobRow) {
  const supabase = createAdminClient()

  try {
    const result = await processUploadJobByType(job.file_type, {
      supabase,
      userId: job.user_id,
      userEmail: job.user_email,
      marketplace: job.marketplace,
      requestedStoreId: job.requested_store_id,
      fileName: job.file_name,
      buffer: Buffer.from(job.payload_base64, 'base64'),
      reportProgress: (progress, label) => updateJobProgress(job.id, progress, label),
    })

    await supabase
      .from('upload_jobs')
      .update({
        status: 'completed',
        progress: 100,
        progress_label: 'Upload selesai',
        result,
        resolved_store_id: result.storeId ?? job.resolved_store_id ?? job.requested_store_id,
        payload_base64: '',
        payload_size_bytes: 0,
        finished_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', job.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan server.'
    console.error(`Upload job ${job.id} failed:`, error)

    await supabase
      .from('upload_jobs')
      .update({
        status: 'failed',
        progress_label: 'Upload gagal',
        error_message: message,
        payload_base64: '',
        payload_size_bytes: 0,
        finished_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', job.id)
  }
}

async function drainUploadQueue() {
  await requeueStaleJobs()

  while (true) {
    const nextJob = await claimNextUploadJob()
    if (!nextJob) return
    await processClaimedUploadJob(nextJob)
  }
}

export function kickUploadWorker() {
  if (!drainPromise) {
    drainPromise = drainUploadQueue().finally(() => {
      drainPromise = null
    })
  }
}

export async function enqueueUploadJob(params: {
  userId: string
  userEmail: string | null
  requestedStoreId: string | null
  fileName: string
  fileType: UploadFileType
  marketplace: string
  buffer: Buffer
}) {
  const supabase = createAdminClient()
  const payloadBase64 = params.buffer.toString('base64')
  const { data, error } = await supabase
    .from('upload_jobs')
    .insert({
      user_id: params.userId,
      requested_store_id: params.requestedStoreId,
      user_email: params.userEmail,
      file_name: params.fileName,
      file_type: params.fileType,
      marketplace: params.marketplace,
      status: 'queued',
      progress: 0,
      progress_label: 'Masuk antrean upload',
      payload_base64: payloadBase64,
      payload_size_bytes: params.buffer.byteLength,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Gagal membuat job upload: ${error?.message ?? 'unknown error'}`)
  }

  kickUploadWorker()
  return serializeJob(data as UploadJobRow)
}

export async function getUploadJobForUser(jobId: string, userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  if (data.status === 'queued') {
    kickUploadWorker()
  }

  return serializeJob(data as UploadJobRow)
}
