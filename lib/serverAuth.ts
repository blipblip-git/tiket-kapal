// lib/serverAuth.ts
// Helper KHUSUS SERVER. Jangan di-import dari komponen client (service role key rahasia).

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ProfilSuperadmin = {
  id: string
  nama: string | null
  role: string | null
  aktif: boolean | null
}

export function buatClientAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export function pesanServiceKeyKosong() {
  return NextResponse.json({
    error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di server (Vercel -> Settings -> Environment Variables)'
  }, { status: 500 })
}

// Klien memakai ANON key (publik). Dipakai sebagai cadangan kalau kunci server
// di environment bukan service_role penuh (mis. "sb_secret_..." yang tidak
// punya GRANT SELECT di sebagian tabel). Tabel yang dibaca tetap dibatasi RLS.
export function buatClientAnon(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export function uuidValid(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

type HasilAuth =
  | { ok: true; admin: SupabaseClient; profile: ProfilSuperadmin }
  | { ok: false; response: NextResponse }

/**
 * Wajib sesi Supabase Auth milik Superadmin.
 * Dipakai oleh semua API /api/superadmin/* supaya endpoint tidak bisa dipanggil
 * sembarang orang (dulu bisa di-POST tanpa login).
 */
export async function wajibSuperadmin(request: Request): Promise<HasilAuth> {
  const admin = buatClientAdmin()
  if (!admin) return { ok: false, response: pesanServiceKeyKosong() }

  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({
        error: 'Akses ditolak. Sesi Superadmin tidak ditemukan, silakan login ulang di /superadmin.'
      }, { status: 401 })
    }
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json({
        error: 'Akses ditolak. Sesi Superadmin tidak valid atau sudah kedaluwarsa.'
      }, { status: 401 })
    }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, nama, role, aktif')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Gagal memeriksa profil: ' + profileError.message }, { status: 500 })
    }
  }

  const role = (profile?.role || '').trim().toLowerCase()

  if (!profile || role !== 'superadmin' || profile.aktif === false) {
    return {
      ok: false,
      response: NextResponse.json({
        error: 'Akses ditolak. Hanya Superadmin aktif yang boleh melakukan aksi ini.'
      }, { status: 403 })
    }
  }

  return { ok: true, admin, profile: profile as ProfilSuperadmin }
}
