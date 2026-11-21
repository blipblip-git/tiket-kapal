// lib/publikPesanan.ts
// Baca data pesanan untuk halaman PUBLIK (pengunjung tanpa login).
//
// Setelah security-tahap3-publik.sql dijalankan, anon tidak boleh lagi
// SELECT langsung ke tabel pesanan. Halaman publik memakai RPC yang hasilnya
// dibatasi (hanya ID yang diketahui / hanya nomor HP sendiri).
// Fallback ke query tabel dipertahankan supaya situs tetap jalan sebelum SQL
// tahap 3 dijalankan.

import { supabase } from './supabase'

export type PesananPublik = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  status: string
  jadwal_id: string
  kursi_id: string | null
  is_balita: boolean
}

export type TiketPublik = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  status: string
  waktu_pesan: string
  grup_transaksi_id: string
  jadwal_id: string
  jadwal?: {
    rute_asal: string
    rute_tujuan: string
    tanggal: string
    jam_berangkat: string
  }
}

/** Pesanan untuk halaman pembayaran (berdasarkan ID yang ada di URL). */
export async function ambilPesananPublik(ids: string[]): Promise<{ data: PesananPublik[]; error: string | null }> {
  const unik = [...new Set(ids.filter(Boolean))]
  if (unik.length === 0) return { data: [], error: null }

  const rpc = await supabase.rpc('publik_pesanan_ids', { p_ids: unik })
  if (!rpc.error) {
    return { data: (rpc.data || []) as PesananPublik[], error: null }
  }

  // Sebelum SQL tahap 3 dijalankan (fungsi belum ada) — pakai cara lama.
  const lama = await supabase
    .from('pesanan')
    .select('id, nama_penumpang, kode_tiket, status, jadwal_id, kursi_id, is_balita')
    .in('id', unik)

  return {
    data: (lama.data || []) as PesananPublik[],
    error: lama.error ? lama.error.message : null
  }
}

/** Tiket milik satu nomor HP (halaman cek tiket). */
export async function cariTiketPublik(noHp: string): Promise<{ data: TiketPublik[]; error: string | null }> {
  const hp = String(noHp || '').replace(/\D/g, '')
  if (!hp) return { data: [], error: null }

  const rpc = await supabase.rpc('publik_tiket_hp', { p_hp: hp })
  if (!rpc.error) {
    const data = ((rpc.data || []) as any[]).map((t) => ({
      id: t.id,
      nama_penumpang: t.nama_penumpang,
      kode_tiket: t.kode_tiket,
      status: t.status,
      waktu_pesan: t.waktu_pesan,
      grup_transaksi_id: t.grup_transaksi_id,
      jadwal_id: t.jadwal_id,
      jadwal: {
        rute_asal: t.rute_asal || '-',
        rute_tujuan: t.rute_tujuan || '-',
        tanggal: t.tanggal || '',
        jam_berangkat: t.jam_berangkat || ''
      }
    })) as TiketPublik[]
    return { data, error: null }
  }

  // Fallback sebelum SQL tahap 3 dijalankan.
  const lama = await supabase
    .from('pesanan')
    .select(`
      id, nama_penumpang, kode_tiket, status, waktu_pesan, grup_transaksi_id, jadwal_id,
      jadwal:jadwal_id (rute_asal, rute_tujuan, tanggal, jam_berangkat)
    `)
    .eq('nomor_hp', hp)
    .in('status', ['pending', 'paid'])
    .order('waktu_pesan', { ascending: false })

  return {
    data: (lama.data || []) as unknown as TiketPublik[],
    error: lama.error ? lama.error.message : null
  }
}
