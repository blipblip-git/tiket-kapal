// lib/payment/types.ts
// Kontrak adapter pembayaran & pencairan dana.
//
// Semua gateway (iPaymu, Midtrans, Duitku, ...) diimplementasikan sebagai
// provider dengan bentuk yang sama. Kode aplikasi HANYA berbicara dengan
// interface ini, jadi menambah/mengganti gateway tidak menyentuh alur closing
// kapal, laporan, maupun tabel pesanan.

export type StatusPembayaran = 'pending' | 'paid' | 'expired' | 'gagal' | 'refund'

export type PenerimaDana = {
  /** pemilik = pemilik kapal (PT/operator), platform = kita, agen = penjual agen. */
  tipe: 'pemilik' | 'platform' | 'agen'
  /** profiles.id pemilik/agen; null untuk platform. */
  id?: string | null
  nama?: string | null
  nominal: number
}

export type PermintaanTagihan = {
  /** Kode internal kita (unik). Dikirim ke gateway sebagai reference/merchantRef. */
  kodeBayar: string
  operatorId?: string | null
  /**
   * Wadah transaksi. Kapal menentukan closing & laporan, PT menentukan
   * penerima transfer. Gateway hanya butuh nama untuk deskripsi.
   */
  kapalId?: string | null
  kodeKapal?: string | null
  namaKapal?: string | null
  namaPt?: string | null
  metodeKode: string
  jumlahTiket: number
  /** Hak pemilik + fee platform, TANPA biaya layanan. */
  dasar: number
  /** Biaya layanan yang dibebankan ke pembeli. */
  biayaLayanan: number
  /** dasar + biayaLayanan. */
  total: number
  penerima: PenerimaDana[]
  deskripsi: string
  expiredAt?: string | null
  /** Data tambahan: id pesanan, nama pembeli, nomor HP, dsb. */
  metadata?: Record<string, unknown>
}

export type Tagihan = {
  kodeBayar: string
  total: number
  metodeKode: string
  /** Teks instruksi yang ditampilkan ke pembeli (VA, QRIS, transfer manual). */
  instruksi?: string | null
  /** Payload QRIS (string) kalau gateway mengembalikan QR. */
  qrString?: string | null
  /** Nomor VA kalau metodenya virtual account. */
  vaNomor?: string | null
  /** URL halaman pembayaran gateway (redirect). */
  redirectUrl?: string | null
  pgRef?: string | null
  raw?: unknown
}

export type HasilCekStatus = {
  status: StatusPembayaran
  pgRef?: string | null
  /** Biaya gateway yang benar-benar dipotong (kalau gateway mengirimkannya). */
  mdrAktual?: number | null
  paidAt?: string | null
  raw?: unknown
}

export interface PaymentProvider {
  kode: string
  /** true = gateway sungguhan (webhook), false = verifikasi manual oleh petugas. */
  otomatis: boolean
  buatTagihan(permintaan: PermintaanTagihan): Promise<Tagihan>
  cekStatus(kodeBayar: string): Promise<HasilCekStatus>
}

export type RekeningTujuan = {
  bankKode?: string | null
  nomor: string
  nama: string
  /** ID beneficiary/sub-merchant hasil verifikasi gateway. */
  beneficiaryId?: string | null
}

export type PermintaanPayout = {
  /** Kode internal (kode_bayar / pembayaran_split.id) untuk idempotensi. */
  referensi: string
  nominal: number
  rekening: RekeningTujuan
  catatan?: string | null
}

export type StatusPayout = 'menunggu' | 'dikirim' | 'selesai' | 'gagal'

export type HasilPayout = {
  status: StatusPayout
  pgRef?: string | null
  pesan?: string | null
  raw?: unknown
}

export interface PayoutProvider {
  kode: string
  /** true = pencairan otomatis lewat API, false = transfer manual oleh admin. */
  otomatis: boolean
  kirimDana(permintaan: PermintaanPayout): Promise<HasilPayout>
  cekStatus(referensi: string): Promise<HasilPayout>
}
