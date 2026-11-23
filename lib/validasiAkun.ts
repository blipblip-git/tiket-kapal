// lib/validasiAkun.ts
// Dipanggil form Admin sebelum membuat/mengubah akun agen, petugas, kolektor.
// Pemeriksaan sebenarnya dilakukan di server dengan service role supaya nomor
// HP yang sudah dipakai penyewa lain tetap terdeteksi.

import { supabase } from './supabase'

export type HasilValidasiNomorHp =
  | { ok: true }
  | { ok: false; pesan: string }

export function pesanGagalSimpanAkun(err: unknown): string {
  const kesalahan = err as { code?: unknown; message?: unknown } | null
  const pesan = typeof kesalahan?.message === 'string' ? kesalahan.message : ''

  if (
    kesalahan?.code === '23505' ||
    /profiles_nomor_hp_unik|duplicate key|sudah ada|already exists/i.test(pesan)
  ) {
    return 'Nomor HP/Email sudah dipakai akun lain. Satu nomor HP hanya boleh untuk satu login. Silakan ganti nomor HP.'
  }

  return pesan || 'Gagal menyimpan akun.'
}

export async function validasiNomorHpUnik(
  nomorHp: string,
  kecualiId?: string | null
): Promise<HasilValidasiNomorHp> {
  const bersih = nomorHp.trim()
  if (!bersih) {
    return { ok: false, pesan: 'Nomor HP wajib diisi.' }
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return {
      ok: false,
      pesan: 'Sesi Admin tidak ditemukan. Silakan login ulang sebelum menambah atau mengubah akun.'
    }
  }

  try {
    const response = await fetch('/api/admin/validasi-nomor-hp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        nomor_hp: bersih,
        ...(kecualiId ? { kecuali_id: kecualiId } : {})
      })
    })

    const hasil = await response.json().catch(() => ({}))
    if (response.ok) return { ok: true }

    return {
      ok: false,
      pesan: hasil?.error || 'Nomor HP ini tidak bisa dipakai. Silakan ganti nomor HP.'
    }
  } catch (err) {
    return {
      ok: false,
      pesan: 'Gagal memeriksa nomor HP: ' + (err instanceof Error ? err.message : 'koneksi bermasalah')
    }
  }
}
