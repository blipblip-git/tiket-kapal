// app/api/auth/login/route.ts
// Login Petugas / Agen / Admin Utama diproses di SERVER:
// - password dicek terhadap hash (password_plain lama dimigrasi otomatis saat login)
// - browser tidak lagi membaca kolom password dari tabel profiles

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { hashPasswordServer, kolomPasswordHashBelumAda, verifyPassword } from '@/lib/passwordServer'
import type { SupabaseClient } from '@supabase/supabase-js'


const BATAS_PERCOBAAN = 8
const JENDELA_MS = 10 * 60 * 1000 // 10 menit

const catatanPercobaan = new Map<string, { jumlah: number; mulai: number }>()

function kunciPercobaan(request: Request, identifier: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'tanpa-ip'
  return `${ip}|${identifier.toLowerCase()}`
}

function kenaLimit(kunci: string): boolean {
  const data = catatanPercobaan.get(kunci)
  if (!data) return false
  if (Date.now() - data.mulai > JENDELA_MS) {
    catatanPercobaan.delete(kunci)
    return false
  }
  return data.jumlah >= BATAS_PERCOBAAN
}

function catatGagal(kunci: string) {
  const data = catatanPercobaan.get(kunci)
  if (!data || Date.now() - data.mulai > JENDELA_MS) {
    catatanPercobaan.set(kunci, { jumlah: 1, mulai: Date.now() })
    return
  }
  data.jumlah += 1
}

const KOLOM_DASAR =
  'id, email, nama, role, lokasi, unit, nomor_hp, operator_id, nama_perusahaan, aktif, sesi_aktif'
const KOLOM_LENGKAP = `${KOLOM_DASAR}, password_plain, password_hash`
const KOLOM_TANPA_HASH = `${KOLOM_DASAR}, password_plain`
const KOLOM_TANPA_PLAIN = `${KOLOM_DASAR}, password_hash`

type ProfilLogin = {
  id: string
  email: string | null
  nama: string | null
  role: string | null
  lokasi: string | null
  unit: string | null
  nomor_hp: string | null
  operator_id: string | null
  nama_perusahaan: string | null
  aktif: boolean | null
  sesi_aktif: boolean | string | null
  password_plain?: string | null
  password_hash?: string | null
}

async function cariProfil(
  admin: SupabaseClient,
  kolom: 'email' | 'nomor_hp',
  nilai: string
): Promise<{ profil: ProfilLogin | null; adaKolomHash: boolean; error: string | null }> {
  // Urutan percobaan: kolom lengkap -> tanpa hash (DB lama) -> tanpa plaintext (setelah migrasi).
  const pilihanKolom = [KOLOM_LENGKAP, KOLOM_TANPA_HASH, KOLOM_TANPA_PLAIN, KOLOM_DASAR]
  let errorTerakhir: string | null = null

  for (const pilihan of pilihanKolom) {
    const { data, error } = await admin
      .from('profiles')
      .select(pilihan)
      .eq(kolom, nilai)
      .maybeSingle()

    if (!error) {
      return {
        profil: (data as ProfilLogin | null) ?? null,
        adaKolomHash: pilihan.includes('password_hash'),
        error: null
      }
    }

    const masalahKolom =
      kolomPasswordHashBelumAda(error) ||
      /password_plain/i.test(error.message || '') ||
      /does not exist/i.test(error.message || '')

    if (!masalahKolom) {
      return { profil: null, adaKolomHash: false, error: error.message }
    }

    errorTerakhir = error.message
  }

  return { profil: null, adaKolomHash: false, error: errorTerakhir }
}

export async function POST(request: Request) {
  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  let body: { identifier?: unknown; login?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const identifier = String(body.identifier ?? body.login ?? '').trim()
  const password = String(body.password ?? '')

  if (!identifier || !password) {
    return NextResponse.json({ error: 'Nomor HP/Email dan password wajib diisi.' }, { status: 400 })
  }

  if (identifier.length > 120 || password.length > 200) {
    return NextResponse.json({ error: 'Nomor HP/Email atau password tidak valid.' }, { status: 400 })
  }

  const kunci = kunciPercobaan(request, identifier)
  if (kenaLimit(kunci)) {
    return NextResponse.json({
      error: 'Terlalu banyak percobaan login. Tunggu 10 menit lalu coba lagi.'
    }, { status: 429 })
  }

  try {
    // Cari berdasarkan email dulu, lalu nomor HP (tanpa menyisipkan input ke filter PostgREST).
    let hasil = await cariProfil(admin, 'email', identifier)
    if (!hasil.profil && !hasil.error) {
      hasil = await cariProfil(admin, 'nomor_hp', identifier)
    }

    if (hasil.error) {
      return NextResponse.json({ error: 'Gagal memeriksa akun: ' + hasil.error }, { status: 500 })
    }

    const profil = hasil.profil

    if (!profil) {
      catatGagal(kunci)
      return NextResponse.json({ error: 'Nomor HP/Email atau password salah.' }, { status: 401 })
    }

    const hash = profil.password_hash || null
    const passwordCocok = hash
      ? verifyPassword(password, hash)
      : verifyPassword(password, profil.password_plain)

    if (!passwordCocok) {
      catatGagal(kunci)
      return NextResponse.json({ error: 'Nomor HP/Email atau password salah.' }, { status: 401 })
    }

    if (profil.aktif === false) {
      return NextResponse.json({
        error: 'Akun dinonaktifkan. Hubungi Admin Utama / pemilik platform.'
      }, { status: 403 })
    }

    // Catat sesi aktif (best-effort; tidak boleh menggagalkan login).
    await admin.from('profiles').update({ sesi_aktif: true }).eq('id', profil.id)

    // Migrasi otomatis akun lama: plaintext -> hash, lalu hapus plaintext-nya.
    if (!hash && hasil.adaKolomHash && profil.password_plain) {
      const hashBaru = hashPasswordServer(password)
      const { error: errorMigrasi } = await admin
        .from('profiles')
        .update({ password_hash: hashBaru, password_plain: null })
        .eq('id', profil.id)

      if (errorMigrasi) {
        // Kolom password_plain mungkin sudah di-drop; simpan hash saja.
        if (/password_plain/i.test(errorMigrasi.message)) {
          await admin.from('profiles').update({ password_hash: hashBaru }).eq('id', profil.id)
        } else {
          console.error('Gagal migrasi password ke hash:', errorMigrasi.message)
        }
      }
    }

    catatanPercobaan.delete(kunci)

    return NextResponse.json({
      success: true,
      profile: {
        id: profil.id,
        nama: profil.nama,
        role: profil.role,
        lokasi: profil.lokasi,
        unit: profil.unit,
        email: profil.email,
        nomor_hp: profil.nomor_hp,
        operator_id: profil.operator_id || null,
        nama_perusahaan: profil.nama_perusahaan || null
      }
    })
  } catch (error: any) {
    console.error('Error login:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}
