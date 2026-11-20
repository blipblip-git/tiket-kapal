// Utilitas "Hari Operasi" kapal.
//
// Hari disimpan di kolom `template_jadwal.hari_operasi` berupa array teks huruf
// kecil: ['senin','rabu','jumat'].
// Kalau kolom NULL / array kosong → dianggap beroperasi SETIAP HARI, supaya
// template lama tetap jalan walau kolomnya belum diisi.

export const SEMUA_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const

export type NamaHari = (typeof SEMUA_HARI)[number]

export const LABEL_HARI: Record<NamaHari, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu'
}

// Pecah 'YYYY-MM-DD' jadi komponen UTC (tanggal murni, tidak ikut timezone lokal).
function pecahTanggal(tanggal: string): { tahun: number; bulan: number; hari: number } | null {
  const cocok = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(tanggal || '').trim())
  if (!cocok) return null
  return { tahun: Number(cocok[1]), bulan: Number(cocok[2]), hari: Number(cocok[3]) }
}

function keTanggalString(ms: number): string {
  return new Date(ms).toISOString().split('T')[0]
}

// Normalisasi isi kolom hari_operasi → daftar hari valid (urutan Senin..Minggu).
export function hariOperasiAktif(hari?: string[] | null): NamaHari[] {
  if (!hari || hari.length === 0) return [...SEMUA_HARI]
  const bersih = SEMUA_HARI.filter((h) => hari.includes(h))
  return bersih.length > 0 ? bersih : [...SEMUA_HARI]
}

// Nama hari dari tanggal 'YYYY-MM-DD'. String kosong kalau format tidak valid.
export function namaHari(tanggal: string): NamaHari | '' {
  const p = pecahTanggal(tanggal)
  if (!p) return ''
  const d = new Date(Date.UTC(p.tahun, p.bulan - 1, p.hari))
  if (isNaN(d.getTime())) return ''
  // getUTCDay(): 0 = Minggu → digeser biar Senin = index 0.
  return SEMUA_HARI[(d.getUTCDay() + 6) % 7]
}

// Apakah template beroperasi pada tanggal tersebut?
export function beroperasiPada(tanggal: string, hari?: string[] | null): boolean {
  const nama = namaHari(tanggal)
  if (!nama) return true
  return hariOperasiAktif(hari).includes(nama)
}

// Label siap tampil: "Setiap hari" atau "Senin, Rabu, Jumat".
export function labelHari(hari?: string[] | null | NamaHari[]): string {
  const list = hariOperasiAktif(hari as string[] | null | undefined)
  if (list.length === SEMUA_HARI.length) return 'Setiap hari'
  return list.map((h) => LABEL_HARI[h]).join(', ')
}

// Gabungan hari operasi dari beberapa template (dipakai buat info ke pembeli).
export function gabungHariOperasi(daftar: (string[] | null | undefined)[]): NamaHari[] {
  const set = new Set<NamaHari>()
  daftar.forEach((h) => hariOperasiAktif(h).forEach((x) => set.add(x)))
  return SEMUA_HARI.filter((h) => set.has(h))
}

// Tanggal operasi terdekat mulai dari `tanggal` (inklusif).
// Hasil '' kalau tidak ketemu dalam `maxHari` hari.
export function tanggalOperasiTerdekat(tanggal: string, hari?: string[] | null, maxHari = 30): string {
  const p = pecahTanggal(tanggal)
  if (!p) return ''
  const dasar = Date.UTC(p.tahun, p.bulan - 1, p.hari)
  for (let i = 0; i <= maxHari; i++) {
    const tgl = keTanggalString(dasar + i * 86400000)
    if (beroperasiPada(tgl, hari)) return tgl
  }
  return ''
}

// Tanggal operasi terdekat dari beberapa template sekaligus (paling cepat).
export function tanggalOperasiTerdekatDari(
  tanggal: string,
  daftarHari: (string[] | null | undefined)[],
  maxHari = 30
): string {
  let terdekat = ''
  for (const hari of daftarHari) {
    const kandidat = tanggalOperasiTerdekat(tanggal, hari, maxHari)
    if (kandidat && (!terdekat || kandidat < terdekat)) terdekat = kandidat
  }
  return terdekat
}

// "Rabu, 25 November 2026" untuk teks info.
export function formatTanggalPanjang(tanggal: string): string {
  const p = pecahTanggal(tanggal)
  if (!p) return tanggal
  const d = new Date(Date.UTC(p.tahun, p.bulan - 1, p.hari, 4)) // +4 jam aman dari geser hari
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar'
  }).format(d)
}
