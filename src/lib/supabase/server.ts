import { createLocalClient, createLocalServiceClient } from '@/lib/postgres/local-client'

export async function createClient() {
  return createLocalClient()
}

export async function createServiceClient() {
  return createLocalServiceClient()
}
