// lib/rateLimit.ts
// Pembatas sederhana untuk API publik (anti-spam). Disimpan di memori proses;
// cukup untuk mencegah orang membanjiri pendaftaran tiket dari satu IP.

type Catatan = { jumlah: number; mulai: number }

const catatan = new Map<string, Catatan>()

export function kunciIp(request: Request, awalan: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'tanpa-ip'
  return `${awalan}|${ip}`
}

export function kenaBatas(kunci: string, batas: number, jendelaMs: number): boolean {
  const data = catatan.get(kunci)
  if (!data) return false
  if (Date.now() - data.mulai > jendelaMs) {
    catatan.delete(kunci)
    return false
  }
  return data.jumlah >= batas
}

export function catatPermintaan(kunci: string, jendelaMs: number) {
  const data = catatan.get(kunci)
  if (!data || Date.now() - data.mulai > jendelaMs) {
    catatan.set(kunci, { jumlah: 1, mulai: Date.now() })
    return
  }
  data.jumlah += 1
}

export function hapusKunci(kunci: string) {
  catatan.delete(kunci)
}
