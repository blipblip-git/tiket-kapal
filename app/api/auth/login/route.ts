// app/api/auth/login/route.ts
// Login Petugas / Agen / Admin Utama diproses di SERVER:
// - password dicek terhadap hash (password_plain lama dimigrasi otomatis saat login)
// - browser tidak lagi membaca kolom password dari tabel profiles
//
// Mode 'syahbandar' (portal manifest): TANPA nomor HP/email — password akun itu
// sendiri yang menjadi kunci masuk. Konsekuensinya password antar akun
// syahbandar wajib berbeda (dijaga di Pusat Kontrol → Akun Syahbandar), dan
// percobaan login dibatasi per IP.

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { pastikanSesiStaf } from '@/lib/akunAuth'
import { hashPasswordServer, kolomPasswordHashBelumAda, verifyPassword } from '@/lib/passwordServer'
import { buatTokenSesi } from '@/lib/sessionToken'
import { ROLE_KOLEKTOR, adalahKolektor } from '@/lib/kolektor'
import { normalisasiNomorHp, nomorHpValid } from '@/lib/nomorHp'
import { diLuarJamKerja, JAM_MULAI_DEFAULT, JAM_SELESAI_DEFAULT, rentangJamKerja } from '@/lib/jamKerja'
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

// Kandidat login syahbandar: SEMUA akun ber-role syahbandar (aktif maupun
// tidak, supaya akun nonaktif tetap dapat pesan yang jelas). Login syahbandar
// tidak membawa nomor HP/email, jadi password-lah yang menentukan akun mana
// yang dipakai — karena itu password antar akun syahbandar wajib berbeda.
async function cariKandidatSyahbandar(
  admin: SupabaseClient
): Promise<{ profiles: ProfilLogin[]; adaKolomHash: boolean; error: string | null }> {
  const pilihanKolom = [KOLOM_LENGKAP, KOLOM_TANPA_HASH, KOLOM_TANPA_PLAIN, KOLOM_DASAR]
  let errorTerakhir: string | null = null

  for (const pilihan of pilihanKolom) {
    const { data, error } = await admin
      .from('profiles')
      .select(pilihan)
      .eq('role', 'syahbandar')
      .limit(200)

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

  let body: { identifier?: unknown; login?: unknown; password?: unknown; mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  // mode 'syahbandar' = portal syahbandar hanya memakai PASSWORD (tanpa nomor
  // HP/email). Mode lain (petugas/agen/admin) tetap nomor HP/email + password.
  const mode = String(body.mode ?? '').trim().toLowerCase()
  const loginSyahbandar = mode === 'syahbandar'

  const identifier = loginSyahbandar ? '' : String(body.identifier ?? body.login ?? '').trim()
  const password = String(body.password ?? '')

  if (loginSyahbandar) {
    if (!password) {
      return NextResponse.json({ error: 'Password Syahbandar wajib diisi.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Password tidak valid.' }, { status: 400 })
    }
  } else {
    if (!identifier || !password) {
      return NextResponse.json({ error: 'Nomor HP/Email dan password wajib diisi.' }, { status: 400 })
    }

    if (identifier.length > 120 || password.length > 200) {
      return NextResponse.json({ error: 'Nomor HP/Email atau password tidak valid.' }, { status: 400 })
    }
  }

  // Tanpa nomor HP, kunci pembatas percobaan hanya IP (tetap dibatasi supaya
  // password tidak bisa ditebak berulang-ulang).
  const kunci = kunciPercobaan(request, loginSyahbandar ? 'syahbandar' : identifier)
  if (kenaLimit(kunci)) {
    return NextResponse.json({
      error: 'Terlalu banyak percobaan login. Tunggu 10 menit lalu coba lagi.'
    }, { status: 429 })
  }

  try {
    // Profil bisa datang dari dua pintu: password saja (syahbandar) atau
    // nomor HP/email + password (petugas/agen/admin).
    let profil: ProfilLogin | null = null
    let adaKolomHash = false

    if (loginSyahbandar) {
      const hasilSyahbandar = await cariKandidatSyahbandar(admin)

      if (hasilSyahbandar.error) {
        return NextResponse.json({
          error: 'Gagal memeriksa akun Syahbandar: ' + hasilSyahbandar.error
        }, { status: 500 })
      }

      if (hasilSyahbandar.profiles.length === 0) {
        catatGagal(kunci)
        return NextResponse.json({
          error: 'Belum ada akun Syahbandar. Minta Admin membuatkannya di Pusat Kontrol → Akun Syahbandar.'
        }, { status: 401 })
      }

      adaKolomHash = hasilSyahbandar.adaKolomHash

      const cocokSyahbandar = hasilSyahbandar.profiles.filter((p) => {
        const hashTersimpan = p.password_hash || null
        return hashTersimpan
          ? verifyPassword(password, hashTersimpan)
          : verifyPassword(password, p.password_plain)
      })

      if (cocokSyahbandar.length === 0) {
        catatGagal(kunci)
        return NextResponse.json({ error: 'Password Syahbandar salah.' }, { status: 401 })
      }

      // Password kembar = tidak jelas akun mana yang dipakai. Tolak, jangan
      // menebak, supaya tidak ada yang masuk sebagai akun orang lain.
      if (cocokSyahbandar.length > 1) {
        return NextResponse.json({
          error: 'Password ini dipakai lebih dari satu akun Syahbandar. Minta Admin mengganti password supaya setiap akun berbeda.',
          kode: 'password_ganda'
        }, { status: 409 })
      }

      profil = cocokSyahbandar[0]
    } else {
      // Nomor HP disimpan dalam bentuk baku 08..., tetapi input pengguna boleh
      // memakai +62/62/spasi. Query tetap dicoba dengan bentuk asli untuk data lama.
      const identifierHp = !identifier.includes('@') && nomorHpValid(identifier)
        ? normalisasiNomorHp(identifier)
        : ''

      // Cari berdasarkan email dulu, lalu nomor HP (tanpa menyisipkan input ke filter PostgREST).
      let hasil = await cariProfil(admin, 'email', identifier)
      if (hasil.profiles.length === 0 && !hasil.error) {
        hasil = await cariProfil(admin, 'nomor_hp', identifier)
      }
      if (hasil.profiles.length === 0 && !hasil.error && identifierHp && identifierHp !== identifier) {
        hasil = await cariProfil(admin, 'nomor_hp', identifierHp)
      }

      if (hasil.error) {
        return NextResponse.json({ error: 'Gagal memeriksa akun: ' + hasil.error }, { status: 500 })
      }

      // Cocokkan password ke semua kandidat. Kalau ada lebih dari satu akun yang
      // cocok, data nomor HP sedang ganda: tolak, jangan beri pilihan akun.
      const cocokPassword = hasil.profiles.filter((p) => {
        const hashTersimpan = p.password_hash || null
        return hashTersimpan
          ? verifyPassword(password, hashTersimpan)
          : verifyPassword(password, p.password_plain)
      })

      if (cocokPassword.length === 0) {
        catatGagal(kunci)
        return NextResponse.json({ error: 'Nomor HP/Email atau password salah.' }, { status: 401 })
      }

      if (cocokPassword.length > 1) {
        return NextResponse.json({
          error: 'Nomor HP ini terdaftar pada lebih dari satu akun. Satu nomor HP hanya boleh untuk satu login. Hubungi Admin Utama agar salah satu akun diganti nomor HP-nya.',
          kode: 'nomor_hp_ganda'
        }, { status: 409 })
      }

      profil = cocokPassword[0]
      adaKolomHash = hasil.adaKolomHash
    }

    // Semua cabang di atas sudah menolak kalau akun tidak ketemu; ini penjaga
    // supaya TypeScript tahu profil tidak kosong.
    if (!profil) {
      return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 401 })
    }

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

    // Jam operasional dari Admin Utama wajib dipatuhi. Admin Utama sendiri
    // dikecualikan. Kalau Admin Utama mematikan auto-logout, pembatasan ikut mati.
    //
    // Syahbandar tidak terikat satu penyewa (operator_id kosong), jadi jam
    // kerjanya memakai setelan PLATFORM — baris pengaturan_sistem dengan
    // operator_id NULL yang diatur Superadmin. Tanpa cabang ini, pencarian
    // setelan memakai id profil syahbandar dan hasilnya kosong, sehingga
    // login mereka lolos tanpa batas jam sama sekali.
    const roleLogin = adalahKolektor(profil) ? ROLE_KOLEKTOR : (profil.role || '')
    if (roleLogin !== 'admin_utama' && roleLogin !== 'superadmin') {
      const pakaiJamPlatform = roleLogin === 'syahbandar'
      const operatorId = profil.operator_id || profil.id

      const kueriSetelan = admin
        .from('pengaturan_sistem')
        .select('jam_mulai_kerja, jam_selesai_kerja, auto_logout_aktif')

      const { data: setelan, error: errorSetelan } = await (pakaiJamPlatform
        ? kueriSetelan.is('operator_id', null)
        : kueriSetelan.eq('operator_id', operatorId)
      )
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (errorSetelan) {
        return NextResponse.json({
          error: 'Gagal memeriksa jam operasional: ' + errorSetelan.message
        }, { status: 500 })
      }

      // Petugas/agen tanpa baris setelan = tidak dibatasi (perilaku lama).
      // Syahbandar tetap dibatasi jam bawaan 06:00-17:00 walau barisnya hilang,
      // karena manifest berisi data pribadi penumpang.
      const batasiJam = setelan ? setelan.auto_logout_aktif !== false : pakaiJamPlatform

      if (batasiJam) {
        const jamMulai = setelan?.jam_mulai_kerja || JAM_MULAI_DEFAULT
        const jamSelesai = setelan?.jam_selesai_kerja || JAM_SELESAI_DEFAULT

        if (diLuarJamKerja(new Date(), jamMulai, jamSelesai)) {
          return NextResponse.json({
            error: `Login ditolak. Sekarang di luar jam operasional (${rentangJamKerja(jamMulai, jamSelesai)}). Hubungi Admin Utama jika jam kerja perlu diubah.`,
            kode: 'di_luar_jam_kerja'
          }, { status: 403 })
        }
      }
    }

    // Catat sesi aktif (best-effort; tidak boleh menggagalkan login).
    await admin.from('profiles').update({ sesi_aktif: true }).eq('id', profil.id)

    // Migrasi otomatis akun lama: plaintext -> hash, lalu hapus plaintext-nya.
    if (!hash && adaKolomHash && profil.password_plain) {
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
