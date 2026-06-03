import { createLocalServiceClient } from '@/lib/postgres/local-client'

export function createAdminClient() {
  return createLocalServiceClient()
}
