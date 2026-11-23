// lib/nomorHp.ts
// Aturan satu nomor HP = satu akun login.
// Semua nomor disimpan dalam bentuk baku 08xxxxxxxxxx supaya penulisan
// +62 / 62 / spasi / tanda hubung tidak bisa dipakai untuk menduplikasi akun.

export function normalisasiNomorHp(nilai: unknown): string {
  let digit = String(nilai ?? '').replace(/\D/g, '')
  if (!digit) return ''

  // +62 0811... (ada nol setelah 62) -> 0811...
  if (digit.startsWith('620')) digit = '0' + digit.slice(3)
  // 62 811... -> 0811...
  else if (digit.startsWith('62')) digit = '0' + digit.slice(2)
  // 811... -> 0811...
  else if (digit.startsWith('8')) digit = '0' + digit

  return digit
}

export function nomorHpValid(nilai: unknown): boolean {
  return /^0\d{9,14}$/.test(normalisasiNomorHp(nilai))
}

export function labelPeranAkun(role: string | null | undefined): string {
  if (role === 'agen') return 'Agen'
  if (role === 'terminal_keberangkatan') return 'Petugas Keberangkatan'
  if (role === 'petugas_loket') return 'Petugas Loket'
  if (role === 'kolektor') return 'Kolektor'
  if (role === 'admin_utama') return 'Admin Utama'
  if (role === 'superadmin') return 'Superadmin'
  return role || 'Akun'
}
