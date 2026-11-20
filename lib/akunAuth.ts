// lib/akunAuth.ts
// Helper KHUSUS SERVER: menyiapkan sesi Supabase Auth untuk staf (agen, petugas,
// admin utama). Sesi ini yang membuat database tahu siapa yang menulis, sehingga
// RLS bisa mengunci setiap penyewa ke datanya sendiri.
//
// Password Supabase Auth selalu disamakan dengan password login aplikasi, dan
// emailnya dibuat otomatis (tidak perlu email asli staf).

import type { SupabaseClient } from '@supabase/supabase-js'
import { buatClientAnon } from './serverAuth'

const DOMAIN_AUTH = 'akun.tempakul.app'

export function emailAuthStaf(profileId: string) {
  return `staf-${profileId}@${DOMAIN_AUTH}`
}

// Supabase mewajibkan minimal 6 karakter; password lama yang lebih pendek
// tetap bisa dipakai (ditambah akhiran tetap, hanya di server).
function passwordAuth(password: string) {
  return password.length >= 6 ? password : `${password}#tempakul`
}

async function cariUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) return null

    const ketemu = data.users.find((u) => (u.email || '').toLowerCase() === target)
    if (ketemu) return ketemu.id
    if (data.users.length < 200) return null
  }
  return null
}

export type HasilSesi = {
  session: { access_token: string; refresh_token: string } | null
  error?: string
}

/**
 * Pastikan staf punya akun Supabase Auth lalu login-kan di server.
 * Best-effort: kalau gagal, login aplikasi tetap boleh lanjut (hanya tulis
 * ke database yang akan ditolak setelah SQL pengamanan dijalankan).
 */
export async function pastikanSesiStaf(
  admin: SupabaseClient,
  profil: { id: string; auth_user_id?: string | null },
  password: string
): Promise<HasilSesi> {
  const email = emailAuthStaf(profil.id)
  const sandi = passwordAuth(password)

  let userId = profil.auth_user_id || null
  let perluSimpan = false

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: sandi,
      email_confirm: true,
      user_metadata: { profil_id: profil.id }
    })

    if (error) {
      // Mungkin akun auth-nya sudah pernah dibuat tetapi kolom penghubung
      // belum tersimpan. Cari berdasarkan email.
      userId = await cariUserIdByEmail(admin, email)
    } else {
      userId = data?.user?.id || null
    }
    perluSimpan = !!userId
  }

  if (!userId) {
    return { session: null, error: 'Akun pengaman Supabase Auth gagal dibuat.' }
  }

  // Samakan password auth dengan password aplikasi (termasuk setelah ganti password).
  const { error: errorSandi } = await admin.auth.admin.updateUserById(userId, { password: sandi })
  if (errorSandi) {
    return { session: null, error: 'Gagal menyiapkan password pengaman: ' + errorSandi.message }
  }

  if (perluSimpan) {
    const { error: errorSimpan } = await admin
      .from('profiles')
      .update({ auth_user_id: userId })
      .eq('id', profil.id)

    if (errorSimpan && !/auth_user_id/i.test(errorSimpan.message || '')) {
      console.error('Gagal menyimpan auth_user_id:', errorSimpan.message)
    }
  }

  const anon = buatClientAnon()
  if (!anon) return { session: null, error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY belum diset.' }

  const { data, error } = await anon.auth.signInWithPassword({ email, password: sandi })
  if (error || !data.session) {
    return { session: null, error: error?.message || 'Sesi pengaman gagal dibuat.' }
  }

  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    }
  }
}
