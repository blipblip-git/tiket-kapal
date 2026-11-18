// lib/periode.ts
// Helper periode laporan (bulanan): format & daftar tanggal

export const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

// Ambil bulan berjalan dalam format YYYY-MM (waktu lokal browser)
export function bulanSekarang(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Parse "2026-11" -> { tahun: 2026, bulan: 11 } (bulan 1-12)
export function parseBulan(bulan: string | null | undefined): { tahun: number; bulan: number } | null {
  if (!bulan) return null
  const cocok = /^(\d{4})-(\d{2})$/.exec(bulan)
  if (!cocok) return null
  const tahun = Number(cocok[1])
  const nomorBulan = Number(cocok[2])
  if (!tahun || nomorBulan < 1 || nomorBulan > 12) return null
  return { tahun, bulan: nomorBulan }
}

// "2026-11" -> "November 2026"
export function labelBulan(bulan: string): string {
  const p = parseBulan(bulan)
  if (!p) return bulan
  return `${NAMA_BULAN[p.bulan - 1]} ${p.tahun}`
}

// Daftar semua tanggal dalam 1 bulan: ["2026-11-01", ..., "2026-11-30"]
export function daftarTanggalBulan(bulan: string): string[] {
  const p = parseBulan(bulan)
  if (!p) return []
  const jumlahHari = new Date(p.tahun, p.bulan, 0).getDate() // hari ke-0 bulan berikutnya
  return Array.from({ length: jumlahHari }, (_, i) => `${bulan}-${String(i + 1).padStart(2, '0')}`)
}

// "2026-11-01" -> "01/11/2026"
export function formatTanggalPendek(tanggal: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggal)
  if (!cocok) return tanggal
  return `${cocok[3]}/${cocok[2]}/${cocok[1]}`
}

// 4000000 -> "Rp 4.000.000"
export function formatRupiah(nilai: number): string {
  return `Rp ${nilai.toLocaleString('id-ID')}`
}

// Tanggal cetak hari ini: "18/11/2026"
export function tanggalCetakSekarang(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}
