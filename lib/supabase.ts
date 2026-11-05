// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

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
  password_plain: string | null
  email_dummy: string | null
  auto_logout: boolean
  jam_selesai_kerja_override: string | null
  created_at: string
  lokasi?: string
  unit?: string
  sesi_aktif?: string | null
}

// ==================== GET PROFILE (KHUSUS ADMIN) ====================
export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !data) return null

  if (data.aktif === false) {
    await supabase.auth.signOut()
    return null
  }

  return data as Profile
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
    await supabase.from('audit_log').insert({
      petugas_id: petugas.id,
      petugas_email: petugas.email || 'unknown',
      aksi,
      detail: detail || null,
    })
  } catch (err) {
    console.error('Gagal catat audit:', err)
  }
}

// ==================== AMBIL PENGATURAN SISTEM ====================
export async function ambilPengaturan() {
  const { data, error } = await supabase
    .from('pengaturan_sistem')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// ==================== CEK AUTO-LOGOUT ====================
export async function cekAutoLogout(profile: Profile): Promise<boolean> {
  if (profile.role === 'admin_utama') return false
  if (profile.auto_logout === false) return false

  const pengaturan = await ambilPengaturan()
  if (!pengaturan) return false
  if (pengaturan.auto_logout_aktif === false) return false

  const jamSelesai = profile.jam_selesai_kerja_override || pengaturan.jam_selesai_kerja
  if (!jamSelesai) return false

  const sekarang = new Date()
  const [jamH, jamM] = jamSelesai.split(':').map(Number)
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