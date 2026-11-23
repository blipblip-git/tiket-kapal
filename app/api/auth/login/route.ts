// app/api/auth/login/route.ts
// Login Petugas / Agen / Admin Utama diproses di SERVER:
// - password dicek terhadap hash (password_plain lama dimigrasi otomatis saat login)
// - browser tidak lagi membaca kolom password dari tabel profiles

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { pastikanSesiStaf } from '@/lib/akunAuth'
import { hashPasswordServer, kolomPasswordHashBelumAda, verifyPassword } from '@/lib/passwordServer'
import { buatTokenSesi } from '@/lib/sessionToken'
import { ROLE_KOLEKTOR, adalahKolektor } from '@/lib/kolektor'
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
): Promise<{ profiles: ProfilLogin[]; adaKolomHash: boolean; error: string | null }> {
  // Urutan percobaan: kolom lengkap -> tanpa hash (DB lama) -> tanpa plaintext (setelah migrasi).
  const pilihanKolom = [KOLOM_LENGKAP, KOLOM_TANPA_HASH, KOLOM_TANPA_PLAIN, KOLOM_DASAR]
  let errorTerakhir: string | null = null

  for (const pilihan of pilihanKolom) {
    // Jangan maybeSingle(): nomor HP bisa dipakai lebih dari satu akun
    // (mis. satu agen dan satu petugas). Semua kandidat diambil, lalu
    // password yang menentukan akun mana yang dipakai.
    const { data, error } = await admin
      .from('profiles')
      .select(pilihan)
      .eq(kolom, nilai)
      .limit(50)

    if (!error) {
      return {
        profiles: (data as unknown as ProfilLogin[] | null) ?? [],
        adaKolomHash: pilihan.includes('password_hash'),
        error: null
      }
    }

    const masalahKolom =
      kolomPasswordHashBelumAda(error) ||
      /password_plain/i.test(error.message || '') ||
      /does not exist/i.test(error.message || '')

    if (!masalahKolom) {
      return { profiles: [], adaKolomHash: false, error: error.message }
    }

    errorTerakhir = error.message
  }

  return { profiles: [], adaKolomHash: false, error: errorTerakhir }
}

export async function POST(request: Request) {
  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  let body: { identifier?: unknown; login?: unknown; password?: unknown; profil_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const identifier = String(body.identifier ?? body.login ?? '').trim()
  const password = String(body.password ?? '')
  // Diisi hanya kalau pengguna memilih salah satu akun saat nomor HP/email
  // dipakai beberapa profil. Tetap diverifikasi ulang dengan password.
  const profilIdDipilih = String(body.profil_id ?? '').trim()

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
    if (hasil.profiles.length === 0 && !hasil.error) {
      hasil = await cariProfil(admin, 'nomor_hp', identifier)
    }

    if (hasil.error) {
      return NextResponse.json({ error: 'Gagal memeriksa akun: ' + hasil.error }, { status: 500 })
    }

    // Nomor HP yang sama bisa dipakai beberapa akun. Cocokkan password ke semua
    // kandidat; kalau hanya satu yang cocok, langsung masuk tanpa pilihan.
    const cocokPassword = hasil.profiles.filter((p) => {
      const hash = p.password_hash || null
      return hash
        ? verifyPassword(password, hash)
        : verifyPassword(password, p.password_plain)
    })

    if (cocokPassword.length === 0) {
      catatGagal(kunci)
      return NextResponse.json({ error: 'Nomor HP/Email atau password salah.' }, { status: 401 })
    }

    // Kalau pengguna sudah memilih akun, hanya akun itu yang boleh dipakai.
    const kandidat = profilIdDipilih
      ? cocokPassword.filter((p) => p.id === profilIdDipilih)
      : cocokPassword

    if (kandidat.length === 0) {
      catatGagal(kunci)
      return NextResponse.json({ error: 'Nomor HP/Email atau password salah.' }, { status: 401 })
    }

    if (kandidat.length > 1) {
      return NextResponse.json({
        error: 'Nomor HP/Email ini dipakai lebih dari satu akun. Pilih akun yang ingin dipakai.',
        pilihan_akun: kandidat.map((p) => ({
          id: p.id,
          nama: p.nama,
          role: adalahKolektor(p) ? ROLE_KOLEKTOR : p.role,
          lokasi: p.lokasi,
          unit: p.unit
        }))
      }, { status: 409 })
    }

    const profil = kandidat[0]
    const hash = profil.password_hash || null

    if (profil.aktif === false) {
      return NextResponse.json({
        error: 'Akun dinonaktifkan. Hubungi Admin Utama / pemilik platform.'
      }, { status: 403 })
    }

    // Staf/agen: ikut status perusahaan penyewanya (saklar NonAktifkan dari Superadmin).
    if (profil.operator_id) {
      const { data: induk, error: errorInduk } = await admin
        .from('profiles')
        .select('id, nama_perusahaan, aktif')
        .eq('id', profil.operator_id)
        .maybeSingle()

      if (errorInduk) {
        return NextResponse.json({ error: 'Gagal memeriksa perusahaan penyewa: ' + errorInduk.message }, { status: 500 })
      }

      if (!induk || induk.aktif === false) {
        return NextResponse.json({
          error: `Perusahaan ${induk?.nama_perusahaan || 'penyewa'} sedang dinonaktifkan. Hubungi Admin Utama / pemilik platform.`
        }, { status: 403 })
      }
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

    // Sesi Supabase Auth: dipakai database (RLS) untuk mengenali staf ini.
    // Tanpa sesi ini, staf tetap bisa login aplikasi tetapi tidak bisa menulis
    // data setelah SQL pengamanan tahap 2 dijalankan.
    let sesiAuth: { access_token: string; refresh_token: string } | null = null
    let peringatanSesi: string | null = null
    try {
      const { data: dataAuth, error: errorAuth } = await admin
        .from('profiles')
        .select('auth_user_id')
        .eq('id', profil.id)
        .maybeSingle()

      if (errorAuth && !/auth_user_id/i.test(errorAuth.message || '')) {
        peringatanSesi = 'Gagal membaca penghubung akun: ' + errorAuth.message
      } else {
        const dataAuthTerpilih = dataAuth as { auth_user_id?: string | null } | null
        const hasilSesi = await pastikanSesiStaf(
          admin,
          { id: profil.id, auth_user_id: dataAuthTerpilih?.auth_user_id || null },
          password
        )
        sesiAuth = hasilSesi.session
        if (!sesiAuth) {
          peringatanSesi = hasilSesi.error || 'Sesi pengaman tidak tersedia.'
          console.error('Sesi Auth staf gagal dibuat:', peringatanSesi)
        }
      }
    } catch (err) {
      peringatanSesi = err instanceof Error ? err.message : 'Sesi pengaman tidak tersedia.'
      console.error('Sesi Auth staf error:', peringatanSesi)
    }

    // Kolektor bisa tersimpan sebagai role 'kolektor' atau — kalau database lama
    // menolak role baru — sebagai 'petugas_loket' + unit "Kolektor".
    // Keduanya dikirim ke browser sebagai role 'kolektor'.
    const kolektor = adalahKolektor(profil)
    const roleProfil = kolektor ? ROLE_KOLEKTOR : (profil.role || '')

    return NextResponse.json({
      success: true,
      profile: {
        id: profil.id,
        nama: profil.nama,
        role: roleProfil,
        lokasi: profil.lokasi,
        unit: profil.unit,
        email: profil.email,
        nomor_hp: profil.nomor_hp,
        operator_id: profil.operator_id || null,
        nama_perusahaan: profil.nama_perusahaan || null
      },
      // Token khusus kolektor untuk memanggil API laporan (read-only, terkunci
      // ke lokasi + operator akun tersebut). Role lain tidak butuh token ini.
      api_token: kolektor ? buatTokenSesi(profil.id) : null,
      // Sesi Supabase Auth (access + refresh token) dipasang di browser oleh
      // halaman /login supaya database mengenali staf ini (RLS per penyewa).
      session: sesiAuth,
      peringatan: peringatanSesi
    })
  } catch (error) {
    console.error('Error login:', error)
    return NextResponse.json({
      error: 'Server Error: ' + (error instanceof Error ? error.message : 'Terjadi kesalahan')
    }, { status: 500 })
  }
}
