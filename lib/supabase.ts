// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { lepasKunciKursi } from './segmen'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ==================== TIPE PROFILE ====================
export type Profile = {
  id: string
  email: string
  nama: string
  role: 'admin_utama' | 'petugas_loket' | 'petugas_mobile' | 'terminal_keberangkatan' | string
  operator_id: string | null
  aktif: boolean
  dinonaktifkan_oleh: string | null
  waktu_dinonaktifkan: string | null
  password_plain: string | null // kolom lama (plaintext), hanya untuk migrasi akun lama
  password_hash?: string | null // hash PBKDF2, dipakai login sekarang
  email_dummy: string | null
  auto_logout: boolean
  jam_selesai_kerja_override: string | null
  created_at: string
  lokasi?: string
  unit?: string
  nomor_hp?: string
  nama_perusahaan?: string
  sesi_aktif?: string | null
  api_token?: string | null
  auth_user_id?: string | null
}

// ==================== NAMA PERUSAHAAN UNTUK HEADER DASHBOARD ====================
// Admin Utama memakai nama_perusahaan miliknya sendiri.
// Petugas & Agen memakai nama_perusahaan milik operator induknya.
export async function ambilNamaPerusahaan(profile: Profile): Promise<string> {
  if (profile.nama_perusahaan) return profile.nama_perusahaan

  let operatorId = profile.operator_id || (profile.role === 'admin_utama' ? profile.id : null)

  // Sesi lama (disimpan sebelum login menyertakan operator_id / nama_perusahaan):
  // ambil ulang datanya dari DB supaya tidak perlu logout-login.
  if (!operatorId && profile.id) {
    const { data: diriSendiri } = await supabase
      .from('profiles')
      .select('operator_id, nama_perusahaan, role')
      .eq('id', profile.id)
      .maybeSingle()

    if (diriSendiri?.nama_perusahaan) return diriSendiri.nama_perusahaan
    operatorId = diriSendiri?.operator_id || (diriSendiri?.role === 'admin_utama' ? profile.id : null)
  }

  if (!operatorId) return profile.nama || '-'

  const { data } = await supabase
    .from('profiles')
    .select('nama_perusahaan, nama')
    .eq('id', operatorId)
    .maybeSingle()

  return data?.nama_perusahaan || data?.nama || profile.nama || '-'
}

// ==================== FORMAT DAFTAR ABK (1 BARIS BERNOMOR) ====================
export function formatDaftarAbk(namaAbk?: string[] | null): string {
  if (!namaAbk || namaAbk.length === 0) return '-'
  return namaAbk
    .filter((nama) => nama && nama.trim() !== '')
    .map((nama, idx) => `${idx + 1}. ${nama.trim()}`)
    .join('  ')
}

// ==================== TIPE AUDIT LOG ====================
export type AuditLog = {
  id: string
  petugas_id: string | null
  petugas_email: string
  aksi: string
  detail: any
  waktu: string
  operator_id: string | null
}

// ==================== GET PROFILE (KHUSUS ADMIN) ====================
// Catatan: login petugas/penyewa sekarang lewat /login (server) dan disimpan di
// localStorage. Sesi Supabase Auth yang masih tertinggal di browser yang sama
// (misalnya sisa login Superadmin) TIDAK boleh menimpa sesi lokal itu.
export async function getProfile(opsi?: { utamakanAuth?: boolean }): Promise<Profile | null> {
  const sesiLokal = getOperatorSession()
  const { data: { user } } = await supabase.auth.getUser()

  if (!opsi?.utamakanAuth) {
    if (sesiLokal && (!user || user.id !== sesiLokal.id)) return sesiLokal
  }

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Akun staf memakai Supabase Auth terpisah (profiles.auth_user_id), bukan id profil.
  let profil = !error && data ? (data as Profile) : null
  if (!profil) {
    const { data: viaAuth } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    profil = (viaAuth as Profile | null) || null
  }

  if (!profil) return null

  if (profil.aktif === false) {
    await supabase.auth.signOut()
    return null
  }

  return profil
}

// ==================== GET OPERATOR SESSION (KHUSUS OPERATOR) ====================
export function getOperatorSession(): Profile | null {
  if (typeof window === 'undefined') return null
  const sesi = localStorage.getItem('petugas_session')
  if (!sesi) return null
  try {
    return JSON.parse(sesi) as Profile
  } catch (e) {
    return null
  }
}

// ==================== SATPAM: CEK VALIDASI SESI (BARU) ====================
export async function cekValidasiSesi(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  // 1. Cek Sesi Operator
  const sesiOperatorStr = localStorage.getItem('petugas_session')
  if (sesiOperatorStr) {
    try {
      const sesiOperator = JSON.parse(sesiOperatorStr)
      const { data, error } = await supabase
        .from('profiles')
        .select('sesi_aktif')
        .eq('id', sesiOperator.id)
        .single()
        
      if (error || !data) return false
      
      // Jika token di database beda dengan yang di HP, berarti sudah ditendang
      if (data.sesi_aktif && data.sesi_aktif !== sesiOperator.sesi_token) {
        localStorage.removeItem('petugas_session')
        localStorage.removeItem('mode_kerja')
        window.location.href = '/login?pesan=session_expired'
        return false
      }
      return true
    } catch (e) {
      return false
    }
  }

  // 2. Cek Sesi Admin (Supabase Auth)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const tokenAdmin = localStorage.getItem('admin_session_token')
    if (!tokenAdmin) return true // Biarkan jika belum ada token (login lama)

    const { data, error } = await supabase
      .from('profiles')
      .select('sesi_aktif')
      .eq('id', user.id)
      .single()

    if (error || !data) return false

    if (data.sesi_aktif && data.sesi_aktif !== tokenAdmin) {
      await supabase.auth.signOut()
      localStorage.removeItem('admin_session_token')
      window.location.href = '/login?pesan=session_expired'
      return false
    }
    return true
  }

  return false
}

// ==================== SATPAM: CEK STATUS AKUN STAF (NONAKTIF / DIHAPUS) ====================
// Dipakai SessionGuard: kalau Superadmin menonaktifkan penyewa, semua stafnya
// langsung terlempar ke /login pada navigasi berikutnya.
export async function cekStatusOperator(sesi: Profile | null): Promise<boolean> {
  if (!sesi?.id) return false
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('aktif, operator_id')
      .eq('id', sesi.id)
      .maybeSingle()

    // Gangguan jaringan/DB: jangan tendang pengguna.
    if (error) return true

    // Profil sudah dihapus permanen oleh Superadmin.
    if (!data) return false
    if (data.aktif === false) return false

    // Staf/agen: ikut status perusahaan penyewanya.
    if (data.operator_id) {
      const { data: induk } = await supabase
        .from('profiles')
        .select('aktif')
        .eq('id', data.operator_id)
        .maybeSingle()

      if (!induk || induk.aktif === false) return false
    }

    return true
  } catch {
    return true
  }
}

// ==================== LOGOUT ====================
export async function logout() {
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') {
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('admin_session_token')
    localStorage.removeItem('mode_kerja')
    window.location.href = '/login'
  }
}

export function logoutOperator() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('admin_session_token')
    localStorage.removeItem('mode_kerja')
    window.location.href = '/login'
  }
}

// ==================== CATAT AUDIT ====================
export async function catatAudit(
  petugas: Profile,
  aksi: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    // operator_id wajib ikut supaya log bisa difilter per penyewa di /audit.
    // Sesi lama belum tentu membawa operator_id, jadi ambil ulang dari DB.
    let operatorId = petugas.operator_id || null
    if (!operatorId && petugas.id) {
      const { data } = await supabase
        .from('profiles')
        .select('operator_id')
        .eq('id', petugas.id)
        .maybeSingle()
      operatorId = data?.operator_id || null
    }

    // Banyak akun login pakai nomor HP (kolom email NULL). Jangan tulis "unknown".
    const identitas =
      petugas.email || petugas.nomor_hp || petugas.nama || 'unknown'

    const { error } = await supabase.from('audit_log').insert({
      petugas_id: petugas.id,
      petugas_email: identitas,
      aksi,
      detail: detail || null,
      operator_id: operatorId || (petugas.role === 'admin_utama' ? petugas.id : null),
    })

    // PostgREST mengembalikan error lewat objek, bukan throw — jangan ditelan.
    if (error) console.error('Gagal catat audit:', error.message)
  } catch (err) {
    console.error('Gagal catat audit:', err)
  }
}

// ==================== AMBIL PENGATURAN SISTEM ====================
// Wajib per operator (penyewa). Tanpa operatorId hanya dipakai sebagai fallback
// untuk data lama yang belum punya operator_id.
export async function ambilPengaturan(operatorId?: string | null) {
  let query = supabase.from('pengaturan_sistem').select('*')

  if (operatorId) query = query.eq('operator_id', operatorId)

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// ==================== CEK AUTO-LOGOUT ====================
export async function cekAutoLogout(profile: Profile): Promise<boolean> {
  if (!profile || profile.role === 'admin_utama') return false
  if (profile.auto_logout === false) return false

  // Sesi dari /login tidak membawa auto_logout & jam override, ambil yang terbaru.
  let data = profile
  if (!data.operator_id || typeof data.auto_logout === 'undefined') {
    const { data: terbaru } = await supabase
      .from('profiles')
      .select('operator_id, auto_logout, jam_selesai_kerja_override, aktif')
      .eq('id', profile.id)
      .maybeSingle()

    if (terbaru) data = { ...profile, ...terbaru } as Profile
  }

  if (data.auto_logout === false) return false

  const operatorId = data.operator_id || data.id
  const pengaturan = await ambilPengaturan(operatorId)
  if (!pengaturan) return false
  if (pengaturan.auto_logout_aktif === false) return false

  const jamSelesai = data.jam_selesai_kerja_override || pengaturan.jam_selesai_kerja
  if (!jamSelesai) return false

  const sekarang = new Date()
  const [jamH, jamM] = String(jamSelesai).split(':').map(Number)
  const targetSelesai = new Date()
  targetSelesai.setHours(jamH, jamM, 0, 0)

  return sekarang >= targetSelesai
}

// ==================== FUNGSI PEMBERSIH PESANAN EXPIRED (10 MENIT) ====================
export async function bersihkanPesananExpired() {
  try {
    // Waktu 10 menit yang lalu
    const batasWaktu = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    // 1. Cari pesanan yang statusnya pending dan sudah lewat 10 menit
    const { data: expiredOrders } = await supabase
      .from('pesanan')
      .select('id, kursi_id')
      .eq('status', 'pending')
      .lt('waktu_pesan', batasWaktu)

    if (expiredOrders && expiredOrders.length > 0) {
      const orderIds = expiredOrders.map(o => o.id)
      const kursiIds = expiredOrders.map(o => o.kursi_id).filter(Boolean)

      // 2. Hapus pesanannya
      await supabase.from('pesanan').delete().in('id', orderIds)

      // 2b. Lepas kunci kursi per potongan jalan (kalau tabel kursi_pakai ada)
      await lepasKunciKursi(supabase, orderIds)

      // 3. Kosongkan kursinya
      if (kursiIds.length > 0) {
        await supabase.from('kursi').update({ status: 'kosong' }).in('id', kursiIds)
      }
      
      console.log('Berhasil membersihkan ' + expiredOrders.length + ' pesanan expired')
    }
  } catch (err) {
    console.error('Gagal membersihkan pesanan expired:', err)
  }
}