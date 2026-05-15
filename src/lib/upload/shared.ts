import type { SupabaseClient } from '@supabase/supabase-js'
import { userHasStoreAccess } from '@/lib/store-access'

export async function ensureProfileRow(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null | undefined
) {
  const { error } = await supabase.from('profiles').upsert(
    { id: userId, email: userEmail ?? null, is_paid: false },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  if (error) {
    console.error('Profile upsert error:', error)
  }
}

export async function resolveUploadStore(
  supabase: SupabaseClient,
  userId: string,
  requestedStoreId: string | null,
  marketplace: string
) {
  let storeId = requestedStoreId

  if (storeId) {
    const hasAccess = await userHasStoreAccess(supabase, userId, storeId)
    if (!hasAccess) {
      storeId = null
    }
  }

  if (storeId) {
    return storeId
  }

  const { data: defaultStore } = await supabase
    .from('stores')
    .select('id')
    .eq('user_id', userId)
    .eq('marketplace', marketplace)
    .eq('name', 'Toko Utama')
    .maybeSingle()

  if (defaultStore) {
    return defaultStore.id
  }

  const { data: newStore, error: storeError } = await supabase
    .from('stores')
    .insert({ user_id: userId, name: 'Toko Utama', marketplace })
    .select('id')
    .single()

  if (storeError || !newStore) {
    throw new Error(`Gagal membuat store default: ${storeError?.message ?? 'unknown error'}`)
  }

  return newStore.id
}
