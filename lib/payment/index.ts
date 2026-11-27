// lib/payment/index.ts
// Titik masuk adapter pembayaran & pencairan dana.
//
// Kenapa begini: kalau nanti pindah dari iPaymu ke Midtrans Iris (atau tambah
// Duitku), cukup buat file baru di providers/ lalu daftarkan di sini. Alur
// penjualan, closing kapal, dan laporan TIDAK ikut berubah.

import type { PaymentProvider, PayoutProvider } from './types'
import { paymentManual } from './providers/manual'
import { payoutManual } from './providers/manual-payout'

const daftarPayment: Record<string, PaymentProvider> = {
  manual: paymentManual,
  // ipaymu: paymentIpaymu,     <- aktifkan setelah kontrak & kredensial ada
  // midtrans: paymentMidtrans,
}

const daftarPayout: Record<string, PayoutProvider> = {
  manual: payoutManual,
  // ipaymu: payoutIpaymu,       <- pencairan via iPaymu
  // midtrans: payoutIris,       <- pencairan via Midtrans Iris
}

function pilih<T>(daftar: Record<string, T>, kode: string, jenis: string): T {
  const provider = daftar[kode]
  if (!provider) {
    throw new Error(
      `Provider ${jenis} "${kode}" belum terdaftar. ` +
        `Pilihan saat ini: ${Object.keys(daftar).join(', ')}. ` +
        'Tambahkan adapter-nya di lib/payment/index.ts (lihat docs/PAYMENT.md).'
    )
  }
  return provider
}

/** Provider pembayaran aktif (env PAYMENT_PROVIDER, bawaan: manual). */
export function ambilPaymentProvider(kode?: string | null): PaymentProvider {
  return pilih(daftarPayment, (kode || process.env.PAYMENT_PROVIDER || 'manual').trim().toLowerCase(), 'pembayaran')
}

/** Provider pencairan dana aktif (env PAYOUT_PROVIDER, bawaan: manual). */
export function ambilPayoutProvider(kode?: string | null): PayoutProvider {
  return pilih(daftarPayout, (kode || process.env.PAYOUT_PROVIDER || 'manual').trim().toLowerCase(), 'pencairan')
}

/** true = pembayaran diverifikasi otomatis lewat webhook gateway. */
export function pembayaranOtomatis(kode?: string | null): boolean {
  return ambilPaymentProvider(kode).otomatis
}

/** true = dana pemilik dikirim otomatis lewat API (bukan transfer manual). */
export function pencairanOtomatis(kode?: string | null): boolean {
  return ambilPayoutProvider(kode).otomatis
}
