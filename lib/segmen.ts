// lib/segmen.ts
// ==================== KUNCI KURSI PER SEGMEN (TRANSIT) ====================
//
// Masalah yang diselesaikan:
// Tabel `kursi` disimpan per JADWAL (satu asal + satu tujuan). Jadi kapal 40
// kursi yang melayani Tarakan→Tg Batu dan Tarakan→Berau di jam yang sama punya
// 2 set kursi (40 + 40) padahal kursi fisiknya hanya 40 → bisa terjual 80.
//
// Model di sini:
// 1. "Perjalanan fisik" = kapal + tanggal + rangkaian rute yang bersambung.
//    Jadwal dengan jam sama selalu satu perjalanan; jadwal berikutnya ikut
//    selama jedanya wajar dan pelabuhannya bersambung (mis. Tarakan 14:00 →
//    Tg Batu 16:30 → Berau). Trip terpisah tetap punya kunci berbeda.
// 2. Urutan pelabuhan diturunkan dari pasangan rute pada perjalanan itu.
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

/** Hasil pengelompokan satu perjalanan fisik (bisa terdiri dari beberapa
 *  jadwal/segmen dengan jam berbeda, mis. Tarakan 14:00 → Tg Batu 16:30 → Berau). */
export type InfoPerjalanan = {
  kunci: string
  /** Kunci lama (per jam) untuk kompatibilitas data kursi_pakai sebelum fitur trip. */
  kunciLama: string[]
  urutan: Map<string, number> | null
}

/** Batas interval kalau urutan pelabuhan tidak bisa ditentukan (konservatif:
 *  satu tiket mengunci kursi untuk seluruh perjalanan → tidak mungkin oversold). */
export const SEGMEN_PENUH_DARI = 0
export const SEGMEN_PENUH_SAMPAI = 900

/** Jeda maksimum antar jadwal yang masih dianggap satu perjalanan fisik.
 *  150 menit cukup untuk transit Tarakan → Tg Batu → Berau pada data saat ini,
 *  tetapi tidak menggabungkan trip pagi dan trip sore yang terpisah. */
const JEDA_MAKS_MENIT = 150

function menitDariJam(jam: string): number {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(String(jam || '').trim())
  if (!cocok) return 0
  return Number(cocok[1]) * 60 + Number(cocok[2])
}

function jamPendek(jam: string): string {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(String(jam || '').trim())
  if (!cocok) return String(jam || '').slice(0, 5)
  return `${cocok[1].padStart(2, '0')}:${cocok[2]}`
}

function berbagiPelabuhan(r: RuteMinimal, grup: RuteMinimal[]): boolean {
  const pelabuhan = new Set<string>()
  for (const g of grup) {
    const asal = String(g.rute_asal || '').trim()
    const tujuan = String(g.rute_tujuan || '').trim()
    if (asal) pelabuhan.add(asal)
    if (tujuan) pelabuhan.add(tujuan)
  }
  return (
    pelabuhan.has(String(r.rute_asal || '').trim()) ||
    pelabuhan.has(String(r.rute_tujuan || '').trim())
  )
}

/**
 * Kelompokkan jadwal satu kapal pada satu tanggal menjadi perjalanan fisik.
 *
 * Aturan:
 * - Jadwal yang jamnya sama selalu masuk kelompok yang sama (satu keberangkatan).
 * - Jadwal berikutnya ikut kelompok kalau jedanya <= 150 menit DAN pelabuhannya
 *   bersambung dengan kelompok itu (mis. Tarakan→Tg Batu 14:00 lalu
 *   Tg Batu→Berau 16:30).
 * - Trip terpisah (mis. pagi dan sore) tetap menjadi kelompok berbeda.
 *
 * Kalau urutan pelabuhan dalam satu kelompok tidak tunggal (rute bercabang /
 * putar balik), `hitungUrutanTitik` mengembalikan null dan kursi dikunci
 * konservatif untuk seluruh perjalanan.
 */
export function kelompokkanPerjalanan(rutes: JadwalSegmen[]): JadwalSegmen[][] {
  const urut = [...rutes].sort((a, b) => {
    const selisih = menitDariJam(a.jam_berangkat) - menitDariJam(b.jam_berangkat)
    if (selisih !== 0) return selisih
    return `${a.rute_asal}|${a.rute_tujuan}`.localeCompare(`${b.rute_asal}|${b.rute_tujuan}`)
  })

  const awal: JadwalSegmen[][] = []

  for (const r of urut) {
    let cocok = false

    // Cari kelompok terakhir yang masih bersambung dan jedanya wajar.
    for (let i = awal.length - 1; i >= 0; i--) {
      const grup = awal[i]
      const terakhir = grup[grup.length - 1]
      const selisih = menitDariJam(r.jam_berangkat) - menitDariJam(terakhir.jam_berangkat)
      if (selisih < 0 || selisih > JEDA_MAKS_MENIT) continue

      // Jam sama = satu keberangkatan fisik, walaupun tujuannya berbeda.
      if (selisih === 0 || berbagiPelabuhan(r, grup)) {
        grup.push(r)
        cocok = true
        break
      }
    }

    if (!cocok) awal.push([r])
  }

  // Kalau satu kelompok lintas jam membentuk siklus/putar balik (mis. kapal
  // berangkat lalu kembali ke pelabuhan asal), jangan dipaksa jadi satu trip.
  // Pecah per jam supaya kursi trip pulang tidak ikut terkunci sepanjang hari.
  const hasil: JadwalSegmen[][] = []
  for (const grup of awal) {
    const waktuUnik = new Set(grup.map((r) => jamPendek(r.jam_berangkat)))
    if (waktuUnik.size > 1 && !hitungUrutanTitik(grup)) {
      const perWaktu = new Map<string, JadwalSegmen[]>()
      for (const r of grup) {
        const jam = jamPendek(r.jam_berangkat)
        if (!perWaktu.has(jam)) perWaktu.set(jam, [])
        perWaktu.get(jam)!.push(r)
      }
      perWaktu.forEach((bagian) => hasil.push(bagian))
    } else {
      hasil.push(grup)
    }
  }

  return hasil
}

function kunciKelompok(grup: JadwalSegmen[]): string {
  const pertama = grup[0]
  const jamAwal = grup
    .map((r) => menitDariJam(r.jam_berangkat))
    .reduce((min, n) => (n < min ? n : min), menitDariJam(pertama.jam_berangkat))

  const jam = `${String(Math.floor(jamAwal / 60)).padStart(2, '0')}:${String(jamAwal % 60).padStart(2, '0')}`
  return `${pertama.kapal_id}|${String(pertama.tanggal || '').slice(0, 10)}|${jam}`
}

export type PemakaianKursi = {
  nomor_kursi: string
  segmen_dari: number
  segmen_sampai: number
  pesanan_id?: string | null
}

/** Kunci lama per jam (`kapal|tanggal|jam`). Masih dipakai untuk cache dan
 *  kompatibilitas data `kursi_pakai` lama; kunci perjalanan baru berasal dari
 *  `ambilInfoPerjalanan()` yang bisa menggabungkan beberapa jam. */
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


/**
 * Ambil informasi perjalanan fisik untuk satu jadwal.
 *
 * `kunci` dipakai sebagai `keberangkatan_key` di `kursi_pakai`, sehingga semua
 * segmen dalam satu perjalanan (walau jamnya berbeda) berbagi kursi fisik yang
 * sama. Kalau jadwal tidak bisa dikelompokkan dengan aman, interval kursi
 * jatuh ke seluruh perjalanan (konservatif, tidak mungkin oversold).
 */
export async function ambilInfoPerjalanan(
  sb: SupabaseClient,
  j: JadwalSegmen
): Promise<InfoPerjalanan> {
  const { data, error } = await sb
    .from('jadwal')
    .select('kapal_id, tanggal, rute_asal, rute_tujuan, jam_berangkat')
    .eq('kapal_id', j.kapal_id)
    .eq('tanggal', String(j.tanggal || '').slice(0, 10))

  const semua = (error || !data ? [] : (data as unknown as JadwalSegmen[]))

  // Kalau jadwal belum ada di tabel (mis. baru dari template), tetap bisa
  // dihitung dari rute yang sedang dibuka.
  const rutes = semua.length > 0 ? semua : [{ ...j }]
  const grup = kelompokkanPerjalanan(rutes)

  const jamDicari = jamPendek(j.jam_berangkat)
  const asalDicari = String(j.rute_asal || '').trim()
  const tujuanDicari = String(j.rute_tujuan || '').trim()

  const grupSaya =
    grup.find((g) =>
      g.some(
        (r) =>
          jamPendek(r.jam_berangkat) === jamDicari &&
          String(r.rute_asal || '').trim() === asalDicari &&
          String(r.rute_tujuan || '').trim() === tujuanDicari
      )
    ) ||
    grup.find((g) =>
      g.some(
        (r) =>
          String(r.rute_asal || '').trim() === asalDicari &&
          String(r.rute_tujuan || '').trim() === tujuanDicari
      )
    ) ||
    [{ ...j }]

  const kunci = kunciKelompok(grupSaya)
  const tanggal = String(j.tanggal || '').slice(0, 10)
  const kunciLama = Array.from(
    new Set(
      grupSaya.map(
        (r) => `${r.kapal_id}|${tanggal}|${jamPendek(r.jam_berangkat)}`
      )
    )
  ).filter((k) => k !== kunci)

  return {
    kunci,
    kunciLama,
    urutan: hitungUrutanTitik(grupSaya),
  }
}

/** Urutan pelabuhan untuk keberangkatan milik jadwal ini. */
export async function ambilUrutanTitik(
  sb: SupabaseClient,
  j: JadwalSegmen
): Promise<Map<string, number> | null> {
  const info = await ambilInfoPerjalanan(sb, j)
  return info.urutan
}

type GalatSupabase = {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null

function galatTabelHilang(err: GalatSupabase): boolean {
  const teks = `${err?.code || ''} ${err?.message || ''}`
  return /PGRST205|42P01|schema cache|does not exist|relation .*kursi_pakai/i.test(teks)
}

function galatBentrok(err: GalatSupabase): boolean {
  const teks = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`
  return /23P01|kursi_pakai_tanpa_bentrok|conflicting key|exclusion/i.test(teks)
}

/** Galat izin (RLS/grant): bukan soal kursi bentrok, tapi soal hak tulis. */
function galatIzin(err: GalatSupabase): boolean {
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
    .select('keberangkatan_key, nomor_kursi, segmen_dari, segmen_sampai, pesanan_id')
    .in('keberangkatan_key', unik)
    .eq('status', 'aktif')

  if (error) {
    if (galatTabelHilang(error)) return { aktif: false, data: [] }
    // Galat lain (mis. izin) diperlakukan legacy supaya penjualan tidak ikut mati,
    // tapi tetap dicatat untuk penelusuran.
    console.warn('ambilPemakaianKursi:', error.message)
    return { aktif: false, data: [] }
  }

  return {
    aktif: true,
    data: (data || []) as unknown as (PemakaianKursi & { keberangkatan_key: string })[],
  }
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
  const info = await ambilInfoPerjalanan(sb, j)
  const { dari, sampai } = intervalSegmen(j, info.urutan)
  const { aktif, data } = await ambilPemakaianKursi(sb, [info.kunci, ...info.kunciLama])

  const nomor = new Set<string>()
  if (aktif) {
    for (const p of data) {
      // Kunci lama belum punya koordinat segmen global. Anggap seluruh
      // perjalanan terkunci supaya tiket lama tidak bisa oversold.
      const kunciBaru = String(p.keberangkatan_key || '') === info.kunci
      const dariPakai = kunciBaru ? Number(p.segmen_dari) : SEGMEN_PENUH_DARI
      const sampaiPakai = kunciBaru ? Number(p.segmen_sampai) : SEGMEN_PENUH_SAMPAI
      if (intervalBentrok(dariPakai, sampaiPakai, dari, sampai)) {
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

  const info = await ambilInfoPerjalanan(sb, jadwal)
  const key = info.kunci
  const { dari, sampai } = intervalSegmen(jadwal, info.urutan)

  // Idempoten: kalau pesanan ini sudah punya kunci (mis. retry / konfirmasi bayar
  // ulang), kunci lama dibuang dulu supaya tidak bentrok dengan dirinya sendiri.
  const idPesanan = Array.from(new Set(daftar.map((d) => d.pesanan_id).filter(Boolean)))
  const sudahAda = new Set<string>()
  if (idPesanan.length > 0) {
    const { data: lama } = await sb
      .from('kursi_pakai')
      .select('pesanan_id')
      .in('pesanan_id', idPesanan)
    for (const r of lama || []) sudahAda.add(String((r as { pesanan_id?: string | null }).pesanan_id))
    if (sudahAda.size > 0) {
      const { error: errHapus } = await sb.from('kursi_pakai').delete().in('pesanan_id', [...sudahAda])
      if (errHapus && !galatTabelHilang(errHapus)) {
        console.warn('kunciKursi: gagal buang kunci lama:', errHapus.message)
      }
    }
  }

  // Pra-cek: beri pesan yang jelas dulu sebelum menabrak constraint.
  const { aktif, data } = await ambilPemakaianKursi(sb, [key, ...info.kunciLama])
  if (aktif) {
    const terpakai = new Set<string>()
    for (const p of data) {
      // Abaikan kunci milik pesanan yang sama (sudah dibuang di atas / sedang diproses).
      if (sudahAda.has(String(p.pesanan_id || ''))) continue
      const kunciBaru = String(p.keberangkatan_key || '') === key
      const dariPakai = kunciBaru ? Number(p.segmen_dari) : SEGMEN_PENUH_DARI
      const sampaiPakai = kunciBaru ? Number(p.segmen_sampai) : SEGMEN_PENUH_SAMPAI
      if (intervalBentrok(dariPakai, sampaiPakai, dari, sampai)) {
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
 * Lepas kunci kursi dari pesanan ONLINE yang sudah lewat masa bayar (15 menit).
 * Dipanggil dari route server (service role) sebelum membuat pesanan baru, supaya
 * kursi yang ditinggal pembeli otomatis bisa dijual lagi tanpa cron.
 * Hanya kanal 'online' (punya batas 15 menit); pesanan loket/agen dibayar di
 * kasir sehingga kuncinya TIDAK boleh dilepas otomatis.
 */
export async function lepasKunciKedaluwarsa(sb: SupabaseClient, batas = 300): Promise<number> {
  const { data, error } = await sb
    .from('pesanan')
    .select('id')
    .eq('status', 'pending')
    .eq('kanal', 'online')
    .lt('waktu_expired', new Date().toISOString())
    .limit(batas)

  if (error || !data || data.length === 0) return 0

  const ids = data.map((d) => String((d as { id?: string }).id))
  const { error: errHapus } = await sb.from('kursi_pakai').delete().in('pesanan_id', ids)
  if (errHapus && !galatTabelHilang(errHapus)) {
    console.warn('lepasKunciKedaluwarsa:', errHapus.message)
  }
  return ids.length
}
