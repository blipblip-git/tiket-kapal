// lib/demoServer.ts
// Helper KHUSUS SERVER untuk membaca database DEMO dari aplikasi REAL.
//
// Aturan:
// - Demo memakai project Supabase sendiri. Aplikasi REAL hanya membaca daftar
//   penyewa + fee demo lewat server. Browser Superadmin tidak pernah memegang
//   service role key demo.
// - Database demo TIDAK BOLEH sama dengan database real. Pemeriksaan ini
//   mencegah salah setting env yang bisa membuat halaman demo menampilkan data
//   produksi.
// - Tidak ada seed/data contoh di sini. Semua fungsi hanya membaca.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type StatusDemo = {
  siap: boolean
  alasan?: string
}

function rapikanUrl(url: string | undefined): string {
  return String(url || '').trim().replace(/\/+$/, '')
}

/** Apakah env demo sudah diisi dan tidak menunjuk ke database real? */
export function statusDemo(): StatusDemo {
  const urlDemo = rapikanUrl(process.env.DEMO_SUPABASE_URL)
  const keyDemo = String(process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const urlReal = rapikanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const keyReal = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  if (!urlDemo || !keyDemo) {
    return {
      siap: false,
      alasan:
        'Demo belum terhubung. Set DEMO_SUPABASE_URL dan DEMO_SUPABASE_SERVICE_ROLE_KEY di server REAL.'
    }
  }

  if (urlReal && urlDemo === urlReal) {
    return {
      siap: false,
      alasan:
        'DEMO_SUPABASE_URL tidak boleh sama dengan NEXT_PUBLIC_SUPABASE_URL. Demo harus memakai project Supabase terpisah.'
    }
  }

  if (keyReal && keyDemo === keyReal) {
    return {
      siap: false,
      alasan:
        'DEMO_SUPABASE_SERVICE_ROLE_KEY tidak boleh sama dengan SUPABASE_SERVICE_ROLE_KEY milik database real.'
    }
  }

  return { siap: true }
}

/**
 * Klien service-role ke database demo.
 * HANYA untuk route server. Jangan di-import dari komponen client.
 */
/** Pesan error yang aman ditampilkan, tanpa membocorkan objek internal. */
export function pesanError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Kesalahan tidak diketahui'
}

export function buatClientDemoAdmin(): SupabaseClient | null {
  const status = statusDemo()
  if (!status.siap) return null

  return createClient(
    rapikanUrl(process.env.DEMO_SUPABASE_URL),
    String(process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    {
      auth: { autoRefreshToken: false, persistSession: false }
    }
  )
}
