// lib/segmen.ts
// ==================== KUNCI KURSI PER SEGMEN (TRANSIT) ====================
//
// Masalah yang diselesaikan:
// Tabel `kursi` disimpan per JADWAL (satu asal + satu tujuan). Jadi kapal 40
// kursi yang melayani Tarakan→Tg Batu dan Tarakan→Berau di jam yang sama punya
// 2 set kursi (40 + 40) padahal kursi fisiknya hanya 40 → bisa terjual 80.
//
// Model di sini:
// 1. "Keberangkatan" = kapal + tanggal + jam berangkat (diturunkan, tanpa tabel
//    baru). Semua jadwal dengan kunci sama = satu keberangkatan fisik.
// 2. Urutan pelabuhan diturunkan dari pasangan rute pada keberangkatan itu.
//    Contoh: Tarakan→Berau + Tarakan→Tg Batu + Tg Batu→Berau
//    ⇒ Tarakan(0) < Tg Batu(1) < Berau(2).
// 3. Kursi dikunci per INTERVAL (potongan jalan) di tabel `kursi_pakai`:
//    - Beli Tarakan→Tg Batu  : kunci [0,1)  → kursi masih bebas untuk [1,2)
//    - Beli Tg Batu→Berau    : kunci [1,2)  → tidak bentrok dengan [0,1)
//    - Beli Tarakan→Berau    : kunci [0,2)  → bentrok dengan keduanya
// 4. Jaminan keras ada di database (exclusion constraint kursi_pakai_tanpa_bentrok),
//    bukan hanya di tampilan. Kalau tabel belum dibuat, semua fungsi di bawah
//    otomatis jatuh ke mode 'legacy' (perilaku lama) supaya penjualan tidak mati.

import type { SupabaseClient } from '@supabase/supabase-js'

export type JadwalSegmen = {
  id?: string
  kapal_id: string
  tanggal: string
  jam_berangkat: string
  rute_asal: string
  rute_tujuan: string
}

/** Batas interval kalau urutan pelabuhan tidak bisa ditentukan (konservatif:
 *  satu tiket mengunci kursi untuk seluruh perjalanan → tidak mungkin oversold). */
export const SEGMEN_PENUH_DARI = 0
export const SEGMEN_PENUH_SAMPAI = 900

export type PemakaianKursi = {
  nomor_kursi: string
  segmen_dari: number
  segmen_sampai: number
}

/** Kunci satu keberangkatan fisik: `kapal|tanggal|jam`. */
export function kunciKeberangkatan(
  j: Pick<JadwalSegmen, 'kapal_id' | 'tanggal' | 'jam_berangkat'>
): string {
  const tgl = String(j.tanggal || '').slice(0, 10)
  const jam = String(j.jam_berangkat || '').slice(0, 5)
  return `${j.kapal_id}|${tgl}|${jam}`
}

/** Dua interval [dari, sampai) beririsan? */
export function intervalBentrok(
  dariA: number,
  sampaiA: number,
  dariB: number,
  sampaiB: number
): boolean {
  return Math.max(dariA, dariB) < Math.min(sampaiA, sampaiB)
}

type RuteMinimal = { rute_asal: string; rute_tujuan: string }

/** Topological sort; hanya dikembalikan kalau urutannya TUNGGAL (tidak ambigu). */
function urutkanTopo(rutes: RuteMinimal[]): Map<string, number> | null {
  const anak = new Map<string, Set<string>>()
  const derajat = new Map<string, number>()

  const pastikan = (nama: string) => {
    if (!anak.has(nama)) anak.set(nama, new Set())
    if (!derajat.has(nama)) derajat.set(nama, 0)
  }

  for (const r of rutes) {
    const asal = String(r.rute_asal || '').trim()
    const tujuan = String(r.rute_tujuan || '').trim()
    if (!asal || !tujuan || asal === tujuan) continue
    pastikan(asal)
    pastikan(tujuan)
    const set = anak.get(asal)!
    if (!set.has(tujuan)) {
      set.add(tujuan)
      derajat.set(tujuan, (derajat.get(tujuan) || 0) + 1)
    }
  }
  if (derajat.size === 0) return null

  const antre: string[] = []
  derajat.forEach((d, nama) => {
    if (d === 0) antre.push(nama)
  })
  antre.sort()

  const urutan = new Map<string, number>()
  const total = derajat.size
  let posisi = 0
  while (antre.length > 0) {
    // Dua pelabuhan yang posisinya tidak bisa dipastikan → jangan menebak.
    if (antre.length !== 1) return null
    const nama = antre.shift()!
    urutan.set(nama, posisi++)
    for (const t of Array.from(anak.get(nama) || []).sort()) {
      const sisa = (derajat.get(t) || 0) - 1
      derajat.set(t, sisa)
      if (sisa === 0) antre.push(t)
    }
  }

  // Ada siklus / data tidak konsisten.
  if (urutan.size !== total) return null
  return urutan
}

/**
 * Hitung urutan pelabuhan dari rute pada satu keberangkatan.
 *
 * `petunjukPerJam` = rute-rute dari kapal & tanggal yang sama tapi jam lain
 * (dikelompokkan per jam). Dipakai HANYA kalau urutan grup ini ambigu, mis.
 * jadwal 11:00 cuma punya Tarakan→Berau + Tarakan→Tg Batu, sedangkan jadwal
 * 13:30 punya Tg Batu→Berau → urutannya Tarakan < Tg Batu < Berau.
 * Kandidat dari jam lain hanya dipakai kalau TIDAK melanggar rute grup ini
 * (supaya trip arah sebaliknya tidak merusak urutan).
 *
 * Return null kalau tetap tidak bisa dipastikan → kursi dikunci konservatif.
 */
export function hitungUrutanTitik(
  rutes: RuteMinimal[],
  petunjukPerJam: RuteMinimal[][] = []
): Map<string, number> | null {
  const dasar = urutkanTopo(rutes)
  if (dasar) return dasar
  if (!rutes || rutes.length === 0) return null

  // Pelabuhan & relasi wajib dari grup ini.
  const pelabuhan = new Set<string>()
  for (const r of rutes) {
    const asal = String(r.rute_asal || '').trim()
    const tujuan = String(r.rute_tujuan || '').trim()
    if (asal) pelabuhan.add(asal)
    if (tujuan) pelabuhan.add(tujuan)
  }
  if (pelabuhan.size === 0) return null

  const tambahan: RuteMinimal[] = []
  for (const grup of petunjukPerJam) {
    const kandidat = urutkanTopo(grup)
    if (!kandidat) continue

    // Kandidat harus sejalan dengan rute grup ini.
    let sejalan = true
    for (const r of rutes) {
      const a = kandidat.get(String(r.rute_asal || '').trim())
      const b = kandidat.get(String(r.rute_tujuan || '').trim())
      if (a !== undefined && b !== undefined && a > b) {
        sejalan = false
        break
      }
    }
    if (!sejalan) continue

    // Ambil relasi berurutan antar pelabuhan yang relevan.
    const urutKandidat = Array.from(kandidat.entries())
      .filter(([nama]) => pelabuhan.has(nama))
      .sort((a, b) => a[1] - b[1])
      .map(([nama]) => nama)
    for (let i = 0; i + 1 < urutKandidat.length; i++) {
      tambahan.push({ rute_asal: urutKandidat[i], rute_tujuan: urutKandidat[i + 1] })
    }
  }

  if (tambahan.length === 0) return null
  return urutkanTopo([...rutes, ...tambahan])
}

/** Interval potongan jalan untuk satu jadwal. */
export function intervalSegmen(
  j: Pick<JadwalSegmen, 'rute_asal' | 'rute_tujuan'>,
  urutan: Map<string, number> | null
): { dari: number; sampai: number } {
  if (!urutan) return { dari: SEGMEN_PENUH_DARI, sampai: SEGMEN_PENUH_SAMPAI }
  const a = urutan.get(String(j.rute_asal || '').trim())
  const b = urutan.get(String(j.rute_tujuan || '').trim())
  if (a === undefined || b === undefined || a === b) {
    return { dari: SEGMEN_PENUH_DARI, sampai: SEGMEN_PENUH_SAMPAI }
  }
  return { dari: Math.min(a, b), sampai: Math.max(a, b) }
}


/** Urutan pelabuhan untuk keberangkatan milik jadwal ini. */
export async function ambilUrutanTitik(
  sb: SupabaseClient,
  j: JadwalSegmen
): Promise<Map<string, number> | null> {
  // Ambil SEMUA rute kapal ini pada tanggal itu (semua jam): yang se-jam
  // dipakai untuk urutan, jam lain dipakai sebagai petunjuk urutan.
  const { data, error } = await sb
    .from('jadwal')
    .select('rute_asal, rute_tujuan, jam_berangkat')
    .eq('kapal_id', j.kapal_id)
    .eq('tanggal', String(j.tanggal || '').slice(0, 10))

  const jam = String(j.jam_berangkat || '').slice(0, 5)
  const semua = (error || !data ? [] : (data as any[]))
  const seJam = semua.filter((r) => String(r.jam_berangkat || '').slice(0, 5) === jam)

  // Kalau jadwalnya belum ada di tabel (mis. baru dari template), tetap bisa
  // dihitung dari rute yang sedang dibuka.
  const rutes = seJam.length > 0 ? seJam : [{ rute_asal: j.rute_asal, rute_tujuan: j.rute_tujuan }]

  // Kelompokkan jam lain sebagai petunjuk (untuk memutus urutan yang ambigu).
  const perJam = new Map<string, any[]>()
  for (const r of semua) {
    const k = String(r.jam_berangkat || '').slice(0, 5)
    if (!k || k === jam) continue
    if (!perJam.has(k)) perJam.set(k, [])
    perJam.get(k)!.push(r)
  }

  return hitungUrutanTitik(rutes as any, Array.from(perJam.values()) as any)
}

function galatTabelHilang(err: any): boolean {
  const teks = `${err?.code || ''} ${err?.message || ''}`
  return /PGRST205|42P01|schema cache|does not exist|relation .*kursi_pakai/i.test(teks)
}

function galatBentrok(err: any): boolean {
  const teks = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`
  return /23P01|kursi_pakai_tanpa_bentrok|conflicting key|exclusion/i.test(teks)
}

/** Galat izin (RLS/grant): bukan soal kursi bentrok, tapi soal hak tulis. */
function galatIzin(err: any): boolean {
  const teks = `${err?.code || ''} ${err?.message || ''}`
  return /42501|permission denied|row-level security/i.test(teks)
}

/**
 * Baca pemakaian kursi untuk beberapa keberangkatan sekaligus.
 * `aktif=false` → tabel kursi_pakai belum ada / tidak bisa dibaca (mode legacy).
 */
export async function ambilPemakaianKursi(
  sb: SupabaseClient,
  keys: string[]
): Promise<{ aktif: boolean; data: (PemakaianKursi & { keberangkatan_key: string })[] }> {
  const unik = Array.from(new Set(keys.filter(Boolean)))
  if (unik.length === 0) return { aktif: true, data: [] }

  const { data, error } = await sb
    .from('kursi_pakai')
    .select('keberangkatan_key, nomor_kursi, segmen_dari, segmen_sampai')
    .in('keberangkatan_key', unik)
    .eq('status', 'aktif')

  if (error) {
    if (galatTabelHilang(error)) return { aktif: false, data: [] }
    // Galat lain (mis. izin) diperlakukan legacy supaya penjualan tidak ikut mati,
    // tapi tetap dicatat untuk penelusuran.
    console.warn('ambilPemakaianKursi:', error.message)
    return { aktif: false, data: [] }
  }

  return { aktif: true, data: (data || []) as any }
}


/**
 * Nomor kursi yang SUDAH terpakai untuk potongan jalan jadwal ini.
 * Dipakai peta kursi (online/loket/agen) supaya yang terkunci = kursi yang
 * intervalnya beririsan saja, bukan seluruh kapal.
 */
export async function nomorKursiTerpakai(
  sb: SupabaseClient,
  j: JadwalSegmen
): Promise<{ aktif: boolean; nomor: Set<string>; dari: number; sampai: number }> {
  const urutan = await ambilUrutanTitik(sb, j)
  const { dari, sampai } = intervalSegmen(j, urutan)
  const { aktif, data } = await ambilPemakaianKursi(sb, [kunciKeberangkatan(j)])

  const nomor = new Set<string>()
  if (aktif) {
    for (const p of data) {
      if (intervalBentrok(Number(p.segmen_dari), Number(p.segmen_sampai), dari, sampai)) {
        nomor.add(String(p.nomor_kursi))
      }
    }
  }

  return { aktif, nomor, dari, sampai }
}

export type HasilKunci =
  | { ok: true; modus: 'segmen' | 'legacy' }
  | { ok: false; pesan: string }
/**
 * Kunci kursi untuk pesanan yang baru dibuat (dipanggil SEBELUM insert pesanan).
 * Mengembalikan ok:false kalau ada kursi yang sudah dipakai pada interval yang
 * beririsan. Kalau tabel belum ada → ok:true modus 'legacy'.
 */
export async function kunciKursi(
  sb: SupabaseClient,
  params: {
    jadwal: JadwalSegmen
    kanal: string
    daftar: { nomor_kursi: string; pesanan_id: string }[]
    /** true = kalau akun tidak punya hak tulis ke kursi_pakai, jangan gagalkan
     *  penjualan (dipakai halaman loket/agen yang mungkin pakai sesi lama). */
    toleranIzin?: boolean
  }
): Promise<HasilKunci> {
  const { jadwal, kanal, daftar } = params
  if (daftar.length === 0) return { ok: true, modus: 'legacy' }

  const key = kunciKeberangkatan(jadwal)
  const urutan = await ambilUrutanTitik(sb, jadwal)
  const { dari, sampai } = intervalSegmen(jadwal, urutan)

  // Pra-cek: beri pesan yang jelas dulu sebelum menabrak constraint.
  const { aktif, data } = await ambilPemakaianKursi(sb, [key])
  if (aktif) {
    const terpakai = new Set<string>()
    for (const p of data) {
      if (intervalBentrok(Number(p.segmen_dari), Number(p.segmen_sampai), dari, sampai)) {
        terpakai.add(String(p.nomor_kursi))
      }
    }
    const bentrok = daftar.find((d) => terpakai.has(String(d.nomor_kursi)))
    if (bentrok) {
      return {
        ok: false,
        pesan: `Kursi ${bentrok.nomor_kursi} sudah dipesan untuk potongan perjalanan ini. Pilih kursi lain.`,
      }
    }
  }

  const rows = daftar.map((d) => ({
    keberangkatan_key: key,
    nomor_kursi: String(d.nomor_kursi),
    segmen_dari: dari,
    segmen_sampai: sampai,
    pesanan_id: d.pesanan_id,
    kanal,
    status: 'aktif',
  }))

  const { error } = await sb.from('kursi_pakai').insert(rows)

  if (!error) return { ok: true, modus: 'segmen' }

  if (galatBentrok(error)) {
    return { ok: false, pesan: 'Kursi yang dipilih baru saja dipesan orang lain. Muat ulang dan pilih kursi lain.' }
  }
  if (galatTabelHilang(error)) return { ok: true, modus: 'legacy' }
  if (galatIzin(error)) {
    if (params.toleranIzin) {
      console.warn('kunciKursi: tanpa hak tulis kursi_pakai → mode legacy:', error.message)
      return { ok: true, modus: 'legacy' }
    }
    return { ok: false, pesan: 'Tidak punya hak mengunci kursi. Hubungi admin (cek izin tabel kursi_pakai).' }
  }

  return { ok: false, pesan: 'Gagal mengunci kursi: ' + error.message }
}

/** Lepas kunci kursi milik pesanan tertentu (batal / expired / gagal simpan). */
export async function lepasKunciKursi(
  sb: SupabaseClient,
  pesananIds: string[]
): Promise<void> {
  const ids = Array.from(new Set(pesananIds.filter(Boolean)))
  if (ids.length === 0) return
  const { error } = await sb.from('kursi_pakai').delete().in('pesanan_id', ids)
  if (error && !galatTabelHilang(error)) {
    console.warn('lepasKunciKursi:', error.message)
  }
}

/**
 * Lepas kunci kursi dari pesanan online yang sudah lewat masa bayar (15 menit).
 * Dipanggil dari route server (service role) sebelum membuat pesanan baru,
 * supaya kursi yang ditinggal pembeli otomatis bisa dijual lagi tanpa cron.
 */
export async function lepasKunciKedaluwarsa(sb: SupabaseClient, batas = 300): Promise<number> {
  const { data, error } = await sb
    .from('pesanan')
    .select('id')
    .eq('status', 'pending')
    .lt('waktu_expired', new Date().toISOString())
    .limit(batas)

  if (error || !data || data.length === 0) return 0

  const ids = data.map((d: any) => String(d.id))
  const { error: errHapus } = await sb.from('kursi_pakai').delete().in('pesanan_id', ids)
  if (errHapus && !galatTabelHilang(errHapus)) {
    console.warn('lepasKunciKedaluwarsa:', errHapus.message)
  }
  return ids.length
}

