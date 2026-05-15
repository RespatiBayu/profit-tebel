-- Migration 017: async upload job queue

CREATE TABLE IF NOT EXISTS upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  resolved_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  user_email TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('income', 'ads', 'ads_product', 'orders_all')),
  marketplace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  progress_label TEXT,
  payload_base64 TEXT NOT NULL,
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_created
  ON upload_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_status_created
  ON upload_jobs(status, created_at ASC);

ALTER TABLE upload_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own upload jobs" ON upload_jobs;

CREATE POLICY "Users access own upload jobs" ON upload_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_upload_jobs_updated_at ON upload_jobs;

CREATE TRIGGER update_upload_jobs_updated_at
  BEFORE UPDATE ON upload_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
