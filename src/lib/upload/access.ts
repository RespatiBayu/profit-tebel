import { getCurrentUserAccess } from '@/lib/roles'
import type { LocalUser } from '@/lib/postgres/auth'

type SupabaseLike = Parameters<typeof getCurrentUserAccess>[0]

/**
 * Gate akses untuk upload/parse data baru.
 * - Tidak login → 401.
 * - Akun read-only (masa akses habis / belum aktif) → 403. Data lama tetap bisa
 *   dilihat, tapi upload baru diblokir (sesuai aturan akses Basic/Pro).
 */
export async function checkUploadAccess(
  supabase: SupabaseLike
): Promise<
  | { ok: true; user: LocalUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  const access = await getCurrentUserAccess(supabase)
  if (!access) return { ok: false, status: 401, error: 'Unauthorized' }
  if (!access.canUpload) {
    return {
      ok: false,
      status: 403,
      error:
        'Masa akses kamu sudah habis. Perpanjang langganan untuk upload data baru. Data lama tetap bisa dilihat (read-only).',
    }
  }
  return { ok: true, user: access.user }
}
