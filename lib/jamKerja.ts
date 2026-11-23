// lib/jamKerja.ts
// Aturan jam operasional dipakai di browser (auto-logout) DAN di server (login).
// Zona waktu dikunci WITA supaya server Vercel (UTC) dan browser menghitung jam
// yang sama. Jam kerja mengikuti pengaturan Admin Utama, bukan ditebak sendiri.

export const ZONA_WAKTU_KERJA = 'Asia/Makassar'
export const JAM_MULAI_DEFAULT = '06:00'
export const JAM_SELESAI_DEFAULT = '17:00'

const formatJamWita = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_WAKTU_KERJA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function menitDariJam(nilai: unknown): number | null {
  const cocok = /^(\d{1,2}):(\d{2})/.exec(String(nilai ?? '').trim())
  if (!cocok) return null

  const jam = Number(cocok[1])
  const menit = Number(cocok[2])
  if (!Number.isFinite(jam) || !Number.isFinite(menit)) return null
  if (jam < 0 || jam > 23 || menit < 0 || menit > 59) return null

  return jam * 60 + menit
}

function menitSekarangWita(sekarang: Date): number {
  const bagian = formatJamWita.formatToParts(sekarang)
  const jam = Number(bagian.find((b) => b.type === 'hour')?.value ?? 0)
  const menit = Number(bagian.find((b) => b.type === 'minute')?.value ?? 0)
  return jam * 60 + menit
}

// true = sekarang di luar jam operasional.
// Mendukung shift malam (mis. 22:00-06:00). Kalau jam mulai = selesai,
// anggap tidak ada pembatasan supaya salah input tidak mengunci semua akun.
export function diLuarJamKerja(
  sekarang: Date,
  jamMulai: unknown,
  jamSelesai: unknown
): boolean {
  const mulai = menitDariJam(jamMulai)
  const selesai = menitDariJam(jamSelesai)
  if (mulai === null || selesai === null || mulai === selesai) return false

  const kini = menitSekarangWita(sekarang)

  if (mulai < selesai) {
    return kini < mulai || kini >= selesai
  }

  // Shift melewati tengah malam: di luar jam saat sudah selesai tetapi
  // belum masuk lagi.
  return kini >= selesai && kini < mulai
}

export function formatJamKerja(nilai: unknown): string {
  const menit = menitDariJam(nilai)
  if (menit === null) return String(nilai ?? '-')
  const jam = String(Math.floor(menit / 60)).padStart(2, '0')
  const sisa = String(menit % 60).padStart(2, '0')
  return `${jam}.${sisa}`
}

export function rentangJamKerja(jamMulai: unknown, jamSelesai: unknown): string {
  return `${formatJamKerja(jamMulai ?? JAM_MULAI_DEFAULT)}-${formatJamKerja(jamSelesai ?? JAM_SELESAI_DEFAULT)} WITA`
}
