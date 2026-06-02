import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/roles'

/**
 * POST /api/admin/activate
 *
 * Safety net aktivasi manual (superadmin only). Untuk kasus early buyer atau
 * pembayaran iPaymu yang nyangkut (webhook gagal) — superadmin bisa langsung
 * menandai user sebagai lifetime / monthly / cabut, dicari via EMAIL.
 *
 * Beda dari tombol "Grant Pro" per-user: endpoint ini cari user by email
 * (termasuk user yang daftar sendiri, bukan cuma managed account) dan
 * mendukung lifetime, bukan cuma monthly 30 hari.
 *
 * Body: { email: string, plan: 'lifetime' | 'monthly' | 'free', months?: number }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getCurrentUserAccess(supabase)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.isSuperadmin) {
    return NextResponse.json({ error: 'Hanya superadmin yang dapat aktivasi manual' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as {
    email?: string
    plan?: 'lifetime' | 'monthly' | 'free'
    months?: number
  } | null

  const email = body?.email?.trim().toLowerCase() ?? ''
  const plan = body?.plan
  const months = Math.max(1, Math.min(36, Math.floor(body?.months ?? 1)))

  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }
  if (plan !== 'lifetime' && plan !== 'monthly' && plan !== 'free') {
    return NextResponse.json({ error: 'Paket tidak valid' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Cari profil by email (case-insensitive). Service role bypass RLS.
  const { data: profile, error: findErr } = await service
    .from('profiles')
    .select('id, email, full_name, role, subscription_plan, subscription_expires_at, is_paid')
    .ilike('email', email)
    .maybeSingle()

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json(
      { error: `User dengan email "${email}" tidak ditemukan. Pastikan user sudah pernah mendaftar/login.` },
      { status: 404 }
    )
  }
  if (profile.role === 'superadmin') {
    return NextResponse.json({ error: 'Akun superadmin sudah punya akses penuh.' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const manualRef = `MANUAL-${Date.now()}`

  let patch: Record<string, unknown>
  if (plan === 'lifetime') {
    patch = {
      subscription_plan: 'lifetime',
      subscription_expires_at: null,
      subscription_payment_ref: manualRef,
      is_paid: true,
      paid_at: nowIso,
      payment_provider: 'manual',
      payment_id: manualRef,
    }
  } else if (plan === 'monthly') {
    // Perpanjang dari expiry saat ini jika masih aktif, kalau tidak dari sekarang.
    const now = new Date()
    let baseDate = now
    if (
      profile.subscription_plan === 'monthly' &&
      profile.subscription_expires_at &&
      new Date(profile.subscription_expires_at) > now
    ) {
      baseDate = new Date(profile.subscription_expires_at)
    }
    const expiry = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000)
    patch = {
      subscription_plan: 'monthly',
      subscription_expires_at: expiry.toISOString(),
      subscription_payment_ref: manualRef,
    }
  } else {
    // free = cabut akses Pro (tidak mengubah is_paid)
    patch = {
      subscription_plan: 'free',
      subscription_expires_at: null,
    }
  }

  const { data: updated, error: updErr } = await service
    .from('profiles')
    .update(patch)
    .eq('id', profile.id)
    .select('id, email, full_name, subscription_plan, subscription_expires_at')
    .maybeSingle()

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, user: updated })
}
