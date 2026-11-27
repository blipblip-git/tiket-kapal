// lib/payment/providers/manual-payout.ts
// Pencairan dana MANUAL: admin mentransfer sendiri ke rekening pemilik, lalu
// mencatat bukti + status di tabel pembayaran_split.
//
// Dipakai selama belum ada kontrak disbursement/split dengan gateway. Semua
// transfer tetap tercatat supaya laporan bagi hasil tidak menebak-nebak.

import type { HasilPayout, PayoutProvider } from '../types'

export const payoutManual: PayoutProvider = {
  kode: 'manual',
  otomatis: false,

  async kirimDana(permintaan): Promise<HasilPayout> {
    if (!permintaan.nominal || permintaan.nominal <= 0) {
      return { status: 'gagal', pesan: 'Nominal pencairan harus lebih dari 0.' }
    }
    if (!permintaan.rekening?.nomor) {
      return { status: 'gagal', pesan: 'Rekening tujuan belum diisi.' }
    }
    return {
      status: 'menunggu',
      pesan:
        'Mode manual: transfer dilakukan admin, lalu status diubah menjadi selesai beserta bukti transfer.',
      raw: { referensi: permintaan.referensi },
    }
  },

  async cekStatus(): Promise<HasilPayout> {
    return { status: 'menunggu', pesan: 'Status pencairan manual dicek dari catatan admin.' }
  },
}
