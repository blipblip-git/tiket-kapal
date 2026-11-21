// lib/integrasiAuth.ts
// Gerbang API integrasi tenant: wajib header `x-api-key` yang dibuat Superadmin.
// KHUSUS SERVER.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buatClientAdmin, pesanServiceKeyKosong } from './serverAuth'
import { klienDariKunci, type KlienApi } from './apiKlien'
import { catatPermintaan, kenaBatas } from './rateLimit'

export type HasilIntegrasi =
  | { ok: true; admin: SupabaseClient; klien: KlienApi }
  | { ok: false; response: NextResponse }

export async function wajibApiKey(request: Request, awalan: string, batas = 60): Promise<HasilIntegrasi> {
  const admin = buatClientAdmin()
  if (!admin) return { ok: false, response: pesanServiceKeyKosong() }

  const kunci = (request.headers.get('x-api-key') || '').trim()
  if (!kunci) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Header x-api-key wajib diisi. Minta API key ke Superadmin platform.' },
        { status: 401 }
      )
    }
  }

  const { klien, error, belumAktif } = await klienDariKunci(admin, kunci)

  if (belumAktif) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'API integrasi belum diaktifkan di database. Superadmin perlu menjalankan supabase/security-tahap3-publik.sql.' },
        { status: 503 }
      )
    }
  }
  if (!klien) {
    return { ok: false, response: NextResponse.json({ error: error || 'API key tidak valid.' }, { status: 401 }) }
  }

  const kunciBatas = `${awalan}|${klien.id}`
  if (kenaBatas(kunciBatas, batas, 10 * 60 * 1000)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.' }, { status: 429 })
    }
  }

  return { ok: true, admin, klien }
}

export function catatIntegrasi(awalan: string, klien: KlienApi) {
  catatPermintaan(`${awalan}|${klien.id}`, 10 * 60 * 1000)
}

/**
 * Jadwal milik tenant ini. Data lama bisa punya operator_id NULL, jadi pemilik
 * ditentukan dari operator pemilik kapal (sama seperti lib/tenant.ts).
 */
export async function jadwalMilikTenant(
  admin: SupabaseClient,
  jadwalId: string,
  operatorId: string
): Promise<{ jadwal: any | null; error: string | null }> {
  const { data, error } = await admin
    .from('jadwal')
    .select('id, operator_id, kapal_id, harga, tanggal, jam_berangkat, rute_asal, rute_tujuan, status, status_jadwal')
    .eq('id', jadwalId)
    .maybeSingle()

  if (error) return { jadwal: null, error: error.message }
  if (!data) return { jadwal: null, error: 'Jadwal tidak ditemukan.' }

  const baris = data as any
  if (baris.operator_id === operatorId) return { jadwal: baris, error: null }
  if (baris.operator_id) return { jadwal: null, error: 'Jadwal bukan milik Anda.' }

  if (!baris.kapal_id) return { jadwal: null, error: 'Jadwal bukan milik Anda.' }

  const { data: kapal } = await admin.from('kapal').select('operator_id').eq('id', baris.kapal_id).maybeSingle()
  if ((kapal as any)?.operator_id !== operatorId) {
    return { jadwal: null, error: 'Jadwal bukan milik Anda.' }
  }

  return { jadwal: baris, error: null }
}
