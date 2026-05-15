import type { SupabaseClient } from '@supabase/supabase-js'
import type { Store, StoreAccessRole } from '@/types'

type MembershipRow = {
  store_id: string
  role: StoreAccessRole
}

export async function userHasStoreAccess(
  supabase: SupabaseClient,
  userId: string,
  storeId: string
) {
  const { data, error } = await supabase
    .from('store_memberships')
    .select('store_id')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return !!data
}

export async function listAccessibleStores(
  supabase: SupabaseClient,
  userId: string
): Promise<Store[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('store_memberships')
    .select('store_id, role')
    .eq('user_id', userId)

  if (membershipError) {
    throw membershipError
  }

  const rows = (memberships ?? []) as MembershipRow[]
  if (rows.length === 0) {
    return []
  }

  const roleByStoreId = new Map(rows.map((row) => [row.store_id, row.role]))
  const storeIds = rows.map((row) => row.store_id)

  const { data: stores, error: storeError } = await supabase
    .from('stores')
    .select('*')
    .in('id', storeIds)
    .order('created_at', { ascending: true })

  if (storeError) {
    throw storeError
  }

  return ((stores ?? []) as Store[]).map((store) => {
    const accessRole = roleByStoreId.get(store.id) ?? 'member'
    return {
      ...store,
      access_role: accessRole,
      can_manage: store.user_id === userId || accessRole === 'owner',
    }
  })
}
