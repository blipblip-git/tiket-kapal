// lib/payment/providers/manual.ts
// Provider "manual": dipakai SEBELUM gateway aktif (dan sebagai cadangan kalau
// gateway sedang gangguan). Pembeli membayar lewat QRIS statis / transfer bank
// milik platform, lalu petugas atau Superadmin menandai lunas.
//
// Provider ini sengaja tidak memanggil API siapa pun — instruksi bayar diambil
// dari environment supaya bisa diganti tanpa deploy kode.

import type { HasilCekStatus, PaymentProvider, PermintaanTagihan, Tagihan } from '../types'

function instruksiManual(permintaan: PermintaanTagihan): string {
  const bank = (process.env.MANUAL_BANK_INFO || '').trim()
  const qris = (process.env.MANUAL_QRIS_URL || '').trim()
  const pemilik = [permintaan.namaKapal, permintaan.namaPt ? `PT ${permintaan.namaPt}` : '']
    .filter(Boolean)
    .join(' — ')

  const baris = [
    `Total yang harus dibayar: Rp ${permintaan.total.toLocaleString('id-ID')}`,
    `Kode bayar: ${permintaan.kodeBayar}`,
  ]
  if (pemilik) baris.push(`Untuk: ${pemilik}`)
  baris.push('', 'Berita transfer WAJIB memakai kode bayar di atas supaya dana tidak tertukar.')
  if (bank) baris.push('', 'Transfer bank:', bank)
  if (qris) baris.push('', `QRIS statis: ${qris}`)
  baris.push('', 'Tiket diterbitkan setelah pembayaran diverifikasi petugas/admin.')
  return baris.join('\n')
}

export const paymentManual: PaymentProvider = {
  kode: 'manual',
  otomatis: false,

  async buatTagihan(permintaan: PermintaanTagihan): Promise<Tagihan> {
    return {
      kodeBayar: permintaan.kodeBayar,
      total: permintaan.total,
      metodeKode: permintaan.metodeKode,
      instruksi: instruksiManual(permintaan),
      pgRef: null,
      raw: { mode: 'manual' },
    }
  },

  // Status tidak bisa diketahui otomatis: tetap 'pending' sampai admin
  // memverifikasi lewat halaman penerimaan pembayaran.
  async cekStatus(): Promise<HasilCekStatus> {
    return { status: 'pending', pgRef: null, raw: { mode: 'manual' } }
  },
}
