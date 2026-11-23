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
  induk_id: string | null
  grup_transaksi_id: string | null
  kanal: string | null
}

export type TiketPublik = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  status: string
  waktu_pesan: string
  grup_transaksi_id: string
  jadwal_id: string
  is_balita: boolean
  induk_id: string | null
  jadwal?: {
    rute_asal: string
    rute_tujuan: string
    tanggal: string
    jam_berangkat: string
  }
}

type BarisPesananDb = {
  id?: string | null
  nama_penumpang?: string | null
  kode_tiket?: string | null
  status?: string | null
  jadwal_id?: string | null
  kursi_id?: string | null
  is_balita?: boolean | null
  induk_id?: string | null
  grup_transaksi_id?: string | null
  kanal?: string | null
  waktu_pesan?: string | null
  jadwal?: TiketPublik['jadwal'] | TiketPublik['jadwal'][] | null
  rute_asal?: string | null
  rute_tujuan?: string | null
  tanggal?: string | null
  jam_berangkat?: string | null
}

const KOLOM_PESANAN =
  'id, nama_penumpang, kode_tiket, status, jadwal_id, kursi_id, is_balita, induk_id, grup_transaksi_id, kanal'

/**
 * Samakan bentuk data dari RPC lama/baru maupun SELECT tabel.
 * RPC tahap 3 versi lama belum mengirim is_balita/induk_id; kode tiket
 * `BALITA-...` dipakai sebagai penanda cadangan supaya balita tetap
 * menempel ke tiket orang tuanya.
 */
function rapikanPesanan(row: BarisPesananDb): PesananPublik {
  const kode = String(row?.kode_tiket || '')
  return {
    id: String(row?.id || ''),
    nama_penumpang: String(row?.nama_penumpang || ''),
    kode_tiket: kode,
    status: String(row?.status || ''),
    jadwal_id: String(row?.jadwal_id || ''),
    kursi_id: row?.kursi_id ? String(row.kursi_id) : null,
    is_balita: typeof row?.is_balita === 'boolean' ? row.is_balita : /^BALITA/i.test(kode),
    induk_id: row?.induk_id ? String(row.induk_id) : null,
    grup_transaksi_id: row?.grup_transaksi_id ? String(row.grup_transaksi_id) : null,
    kanal: row?.kanal ? String(row.kanal) : null
  }
}

/** Pesanan untuk halaman pembayaran/e-tiket (berdasarkan ID yang ada di URL). */
export async function ambilPesananPublik(ids: string[]): Promise<{ data: PesananPublik[]; error: string | null }> {
  const unik = [...new Set(ids.filter(Boolean))]
  if (unik.length === 0) return { data: [], error: null }

  const rpc = await supabase.rpc('publik_pesanan_ids', { p_ids: unik })

  let data: PesananPublik[] = []
  if (!rpc.error) {
    data = ((rpc.data || []) as BarisPesananDb[]).map(rapikanPesanan)
  } else {
    // Sebelum SQL tahap 3 dijalankan (fungsi belum ada) — pakai cara lama.
    const lama = await supabase.from('pesanan').select(KOLOM_PESANAN).in('id', unik)
    if (lama.error) {
      return { data: [], error: lama.error.message }
    }
    data = ((lama.data || []) as BarisPesananDb[]).map(rapikanPesanan)
  }

  // Jaga-jaga kalau RPC/SQL belum diperbarui: ambil balita yang menempel
  // pada tiket dewasa yang ada di URL. Kalau anon tidak punya izin SELECT
  // (setelah security tahap 3), hasilnya kosong dan diabaikan.
  const dewasaIds = data.filter((x) => !x.is_balita).map((x) => x.id)
  if (dewasaIds.length > 0) {
    const { data: anak } = await supabase
      .from('pesanan')
      .select(KOLOM_PESANAN)
      .in('induk_id', dewasaIds)

    if (anak && anak.length > 0) {
      const peta = new Map(data.map((x) => [x.id, x]))
      ;(anak as BarisPesananDb[]).map(rapikanPesanan).forEach((x) => peta.set(x.id, x))
      data = [...peta.values()]
    }
  }

  return { data, error: null }
}

/** Tiket milik satu nomor HP (halaman cek tiket). */
export async function cariTiketPublik(noHp: string): Promise<{ data: TiketPublik[]; error: string | null }> {
  const hp = String(noHp || '').replace(/\D/g, '')
  if (!hp) return { data: [], error: null }

  const rpc = await supabase.rpc('publik_tiket_hp', { p_hp: hp })
  if (!rpc.error) {
    const data = ((rpc.data || []) as BarisPesananDb[]).map((t) => {
      const rap = rapikanPesanan(t)
      return {
        id: rap.id,
        nama_penumpang: rap.nama_penumpang,
        kode_tiket: rap.kode_tiket,
        status: rap.status,
        waktu_pesan: String(t.waktu_pesan || ''),
        grup_transaksi_id: String(t.grup_transaksi_id || ''),
        jadwal_id: rap.jadwal_id,
        is_balita: rap.is_balita,
        induk_id: rap.induk_id,
        jadwal: {
          rute_asal: t.rute_asal || '-',
          rute_tujuan: t.rute_tujuan || '-',
          tanggal: t.tanggal || '',
          jam_berangkat: t.jam_berangkat || ''
        }
      }
    }) as TiketPublik[]
    return { data, error: null }
  }

  // Fallback sebelum SQL tahap 3 dijalankan.
  const lama = await supabase
    .from('pesanan')
    .select(`
      id, nama_penumpang, kode_tiket, status, waktu_pesan, grup_transaksi_id, jadwal_id,
      is_balita, induk_id,
      jadwal:jadwal_id (rute_asal, rute_tujuan, tanggal, jam_berangkat)
    `)
    .eq('nomor_hp', hp)
    .in('status', ['pending', 'paid'])
    .order('waktu_pesan', { ascending: false })

  if (lama.error) {
    return { data: [], error: lama.error.message }
  }

  const data = ((lama.data || []) as BarisPesananDb[]).map((t) => {
    const rap = rapikanPesanan(t)
    return {
      ...rap,
      waktu_pesan: t.waktu_pesan || '',
      grup_transaksi_id: String(t.grup_transaksi_id || ''),
      jadwal: (Array.isArray(t.jadwal) ? t.jadwal[0] : t.jadwal) || undefined
    } as TiketPublik
  })

  return { data, error: null }
}
