// lib/apiKlien.ts
// Verifikasi API key integrasi milik tenant (tabel api_klien).
// KHUSUS SERVER — memakai service role, jangan di-import komponen client.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type KlienApi = {
  id: string
  operator_id: string
  label: string
}

export function hashKunci(kunci: string): string {
  return createHash('sha256').update(kunci).digest('hex')
}

/** true kalau tabel api_klien / fungsi SQL tahap 3 belum dijalankan. */
export function apiBelumAktif(pesan: string | undefined | null): boolean {
  const t = String(pesan || '').toLowerCase()
  return (
    t.includes('api_klien') ||
    t.includes('does not exist') ||
    t.includes('schema cache') ||
    t.includes('could not find the table')
  )
}

export async function klienDariKunci(
  admin: SupabaseClient,
  kunci: string
): Promise<{ klien: KlienApi | null; error: string | null; belumAktif: boolean }> {
  const bersih = String(kunci || '').trim()
  if (bersih.length < 16) {
    return { klien: null, error: 'API key tidak valid.', belumAktif: false }
  }

  const { data, error } = await admin
    .from('api_klien')
    .select('id, operator_id, label, aktif')
    .eq('kunci_hash', hashKunci(bersih))
    .maybeSingle()

  if (error) {
    return { klien: null, error: error.message, belumAktif: apiBelumAktif(error.message) }
  }
  if (!data || (data as any).aktif === false) {
    return { klien: null, error: 'API key tidak dikenal atau sudah dicabut.', belumAktif: false }
  }

  // Catat pemakaian terakhir (tidak mengganggu kalau gagal).
  await admin.from('api_klien').update({ last_used_at: new Date().toISOString() }).eq('id', (data as any).id)

  return {
    klien: {
      id: (data as any).id,
      operator_id: (data as any).operator_id,
      label: (data as any).label
    },
    error: null,
    belumAktif: false
  }
}
