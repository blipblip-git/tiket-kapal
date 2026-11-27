# Pembayaran Online, Biaya Layanan, dan Pencairan Dana

Dokumen ini menjelaskan rencana pembayaran online (gateway), pembagian uang ke
pemilik kapal, dan persiapan teknis yang sudah ada di repo. **Belum ada gateway
yang aktif**: `PAYMENT_PROVIDER=manual` (transfer/QRIS statis + verifikasi admin).

## 1. Prinsip uang

1. **Harga tiket** = hak pemilik kapal + fee platform (3.000 offline / 5.000 online).
2. **Biaya layanan** (biaya gateway: QRIS 0,7%, VA 3.500–4.000, retail 4.000–5.000,
   e-wallet 1,5–3,5%) **dibebankan ke pembeli**, bukan dipotong dari hak pemilik
   maupun fee platform.
3. Biaya layanan **tidak boleh dilabeli "biaya QRIS"**. Bank Indonesia melarang
   merchant membebankan MDR QRIS sebagai surcharge ke pembeli. Sebut sebagai
   **"biaya layanan"** yang berlaku untuk semua metode (bukan hanya QRIS).
4. Dana pemilik kapal dan fee platform **dibekukan saat transaksi** (snapshot),
   tidak dihitung ulang ketika tarif berubah.

Contoh angka (sesuai kasus nyata):

```
Harga jual (dasar)                150.000
  ├─ pemilik kapal                140.000
  └─ platform                      10.000  (fee online 5.000 + margin lain)
+ biaya layanan QRIS 0,7%           1.058  -> dibayar pembeli
= total ditagih                   151.058
MDR dipotong gateway                1.058
Sisa untuk pemilik + platform      150.000  (utuh)
```

Kalau biaya layanan **tidak** dibebankan ke pembeli, MDR memakan 1.058 dari
bagian platform: 10.000 menjadi 8.942.

## 2. Rumus biaya layanan (gross-up)

Gateway menghitung MDR dari **total tagihan**, bukan dari harga dasar. Maka
menambah `r × dasar` selalu kurang. Yang benar:

```
persen : biaya = ceil( dasar × r / (1 - r) )
flat   : biaya = tarif flat apa adanya
```

Contoh dengan dasar 150.000 (angka di `lib/payment/tarif.ts`):

| Metode | Tarif | Biaya layanan | Total ditagih | MDR | Bersih |
|---|---|---|---|---|---|
| QRIS (H+2) | 0,7% | 1.058 | 151.058 | 1.058 | 150.000 |
| QRIS ≤100rb (H+2) | 0,5% | 754 | 150.754 | 754 | 150.000 |
| VA (H+2) | flat 4.000 | 4.000 | 154.000 | 4.000 | 150.000 |
| VA (H+0) | flat 5.000 | 5.000 | 155.000 | 5.000 | 150.000 |
| Alfamart/Indomaret | flat 5.000 | 5.000 | 155.000 | 5.000 | 150.000 |
| E-wallet | 1,5% | 2.285 | 152.285 | 2.285 | 150.000 |
| Transfer manual | 0 | 0 | 150.000 | 0 | 150.000 |

Semua dihitung dengan `rincianTagihan(dasar, tarif)` sehingga halaman checkout,
API, dan laporan memakai angka yang sama.

> Catatan implementasi: satu baris `metode_bayar` = satu tarif (belum bertingkat).
> Baris `qris` memakai 0,7% untuk semua nominal — konservatif (lebih mahal
> Rp100.000 ke bawah) supaya tidak pernah menagih kurang. Kalau ingin 0,5% di
> bawah Rp100.000, tambahkan baris tarif kedua lalu pilih berdasarkan nominal
> di checkout (pekerjaan fase 1).

## 3. Tarif gateway (iPaymu, publikasi situs — cek ulang saat kontrak)

| Kanal | Tarif | Settlement |
|---|---|---|
| QRIS (≤ Rp100.000) | 0,5% | H+2 |
| QRIS (> Rp100.000) | 0,7% | H+2 |
| QRIS instan | 0,7% + 1,8% | H+0 |
| Virtual Account | Rp3.500 – Rp5.000 (tergantung bank) | H+0 / H+2 |
| Alfamart / Indomaret | Rp4.000 (H+3) atau Rp4.000 + 1,8% (H+0) | H+0 / H+3 |
| E-wallet | 3,5% | H+3 |
| Kartu kredit | 2,5% + Rp2.000 | H+3 |
| **Penarikan dana (payout)** | **Rp3.000** (BI Fast), Rp7.500 bank non-BI Fast | H+0 |

Catatan penting dari tabel di atas:

- **Setiap transfer payout berbiaya Rp3.000.** Kalau pemilik kapal ditransfer per
  tiket, fee platform 5.000 bisa habis. Payout wajib **digabung** (harian/mingguan
  per pemilik).
- QRIS instan 2,5% jauh lebih mahal; jangan diaktifkan tanpa alasan kuat.
- Tarif e-wallet di situs (3,5%) berbeda dari asumsi 1,5% — konfirmasi ke iPaymu
  sebelum menetapkan biaya layanan e-wallet.

## 4. Dua model pencairan

| | **Disbursement** (kumpulkan → transfer) | **Split payment** (gateway pecah otomatis) |
|---|---|---|
| Uang pemilik | Masuk rekening platform dulu | Langsung ke rekening pemilik |
| Float / risiko | Ada; uang pihak lain sempat di rekening kita | Tidak ada |
| Legal | Rutin memindahkan uang pihak lain berpotensi dianggap penyelenggara transfer dana (izin BI) | Posisi marketplace; gateway yang jadi PJP |
| Biaya | Rp3.000 per transfer (harus digabung) | Tidak ada biaya per transfer |
| Syarat | Rekening pemilik saja | Pemilik jadi sub-merchant/beneficiary (KTP/NIB, verifikasi) |
| Refund | Tarik balik dari pemilik (sulit) | Reverse split |

**Rekomendasi:** disbursement manual dengan **batch per closing kapal**, bukan per
tiket dan bukan "batch harian pukul 00:00". Baik disbursement maupun split payment
sama-sama menunggu closing: uang baru boleh keluar setelah jadwal kapal ditutup,
karena sebelum keberangkatan masih mungkin ada refund/pindah jadwal. Split payment
per transaksi karena itu **tidak dipakai** — gateway hanya boleh menagih, pencairan
tetap per closing.

## 4A. Aturan identitas: kapal untuk transaksi, PT untuk transfer

Keputusan operasional (dari pemilik): setiap tiket yang dibayar transfer **tidak
dicairkan per tiket**. Dana menunggu closing sesuai jadwal masing-masing kapal.

| Lapisan | Gunanya | Kunci di database |
|---|---|---|
| **Kapal** | wadah transaksi & closing; nama kapal jadi identitas yang dibaca admin | `tagihan.kapal_id` + snapshot `kode_kapal`, `nama_kapal` |
| **PT / penyewa** | penerima transfer; nama harus sama dengan nama rekening | `tagihan.operator_id` (`profiles.role = admin_utama`) + snapshot `nama_pt` |

Jadi identifikasi pesanan memakai **nama kapal** (karena closing ikut jadwal kapal),
tetapi uangnya ditransfer ke **PT yang terdaftar**. Satu PT boleh punya beberapa
kapal: wadahnya tetap terpisah per kapal, transfernya digabung satu kali.

Pengaman supaya tidak tertukar/tercampur (`supabase/wadah-kapal.sql`):

1. `tagihan.kapal_id` wajib satu operator dengan `tagihan.operator_id` — trigger
   `trg_cek_tagihan_kapal` **menolak** tagihan yang menempel ke kapal PT lain.
2. `kode_kapal`, `nama_kapal`, `nama_pt` di-*snapshot* saat transaksi, jadi laporan
   lama tidak berubah kalau nama kapal/PT diganti.
3. `closing_kapal` unik per `(kapal_id, tanggal)` — satu wadah per kapal per closing,
   tidak bisa dobel.
4. `transfer_pemilik_item.closing_kapal_id` unik — satu wadah hanya bisa masuk satu
   batch transfer, jadi tidak mungkin dibayar dua kali.

Kode bayar membawa identitas kapal: `SDW-261127-K7Q2` (kode kapal + tanggal WITA +
4 karakter acak). Instruksi transfer manual juga menyebut nama kapal & PT dan
mewajibkan kode itu diisi di berita transfer, sehingga rekonsiliasi bisa dilakukan
hanya dari mutasi bank.

Contoh: PT Sadewa punya kapal *Sadewa Jaya* (SAD) dan *Sadewa 02* (SAD2).

```
Closing 27 Nov:
  SAD  -> wadah 140.000 (pemilik) + 10.000 (platform)
  SAD2 -> wadah 185.000 (pemilik) + 15.000 (platform)
Transfer ke PT Sadewa: 1 batch = 325.000 (2 kapal, 1x biaya transfer)
```

Alur pencairan:

1. Jadwal kapal ditutup (semua tiket sudah `paid`), admin memanggil
   `tutupWadahKapal()` → baris `closing_kapal` berisi angka final wadah itu.
2. Setelah semua kapal satu PT ditutup untuk periode tersebut, admin memanggil
   `siapkanTransferPemilik()` → **satu** baris `transfer_pemilik` + item per kapal.
3. Admin transfer sesuai nominal, unggah bukti (`tandaiTransferPemilik()`),
   status wadah berubah `ditransfer` → `selesai`. Gagal transfer = `dibatalkan`,
   wadah bisa masuk batch berikutnya.

## 5. Pengingat biaya layanan di checkout

Sebelum pembeli memilih metode, halaman `/pembayaran` wajib memperlihatkan
**biaya layanan tiap kanal** (bukan hanya metode yang dipilih), karena selisihnya
besar: QRIS ±0,7% gross-up, VA Rp4.000, retail Rp5.000, e-wallet ±1,5%.

Contoh tampilan (dasar 150.000):

| Kanal | Biaya layanan | Total dibayar |
|---|---|---|
| QRIS (H+2) | 1.058 | 151.058 |
| Virtual Account (H+2) | 4.000 | 154.000 |
| E-Wallet (H+3) | 2.285 | 152.285 |
| Alfamart / Indomaret (H+3) | 5.000 | 155.000 |
| Transfer manual | 0 | 150.000 |

Aturan implementasi:

1. Angka dihitung **server** lewat `GET /api/publik/metode?pesanan=<ids>` →
   `ringkasMetode()`. Browser tidak menghitung sendiri karena tarif `metode_bayar`
   bisa diubah Superadmin kapan saja.
2. `dasar` = `jadwal.harga` × jumlah penumpang dewasa (balita tidak dihitung),
   diambil dari database — bukan dari query string — supaya tidak bisa diakali.
3. Badge **TERMURAH** diberikan ke total terkecil **kecuali** transfer manual
   (biayanya 0 tetapi harus diverifikasi admin, jadi tidak otomatis terbit).
4. Setelah metode diklik, muncul popup konfirmasi berisi `harga tiket + biaya
   layanan = total dibayar`, baru pembeli boleh lanjut. Tujuannya menghindari
   komplain "kenapa ditagih lebih dari harga tiket".
5. Biaya layanan **tidak pernah** memotong hak pemilik/platform; ia hanya
   menutup MDR gateway (lihat §2).

## 6. Struktur kode (adapter)

| File | Isi |
|---|---|
| `lib/payment/types.ts` | Kontrak `PaymentProvider` (buat tagihan, cek status) dan `PayoutProvider` (kirim dana, cek status) |
| `lib/payment/tarif.ts` | Rumus biaya layanan (gross-up), tarif bawaan, `ringkasMetode()`/`kodeTermurah()` untuk daftar biaya per kanal |
| `lib/payment/index.ts` | Registry: `ambilPaymentProvider()`, `ambilPayoutProvider()` dari env |
| `lib/payment/providers/manual.ts` | Provider pembayaran manual (instruksi transfer/QRIS statis) |
| `lib/payment/providers/manual-payout.ts` | Payout manual (admin transfer, catat bukti) |
| `lib/payment/layanan.ts` | "paymentService": tulis `tagihan`, `tagihan_split`, update `pesanan.tagihan_id` |
| `lib/payment/wadah.ts` | Wadah kapal: kode bayar berawalan kode kapal, rekap `v_wadah_kapal`, tutup wadah, siapkan transfer per PT |
| `app/api/publik/metode/route.ts` | Daftar metode aktif + biaya layanan per kanal untuk popup checkout (dihitung server) |

Menambah gateway = buat satu file baru di `providers/` lalu daftarkan di
`index.ts`. Alur penjualan, closing kapal, dan laporan tidak disentuh.

Env terkait (lihat `.env.example`): `PAYMENT_PROVIDER`, `PAYOUT_PROVIDER`,
`PAYMENT_MODE`, `MANUAL_BANK_INFO`, `MANUAL_QRIS_URL`, `IPAYMU_VA`,
`IPAYMU_API_KEY`, `PAYMENT_WEBHOOK_SECRET`.

## 7. Skema database (`supabase/tagihan-online.sql` + `supabase/wadah-kapal.sql`)

- `metode_bayar` — daftar kanal + tarif biaya layanan (boleh dibaca publik untuk
  checkout). Sudah diisi QRIS/VA/retail/e-wallet/transfer manual.
- `tagihan` — satu tagihan: `dasar`, `biaya_layanan`, `total_tagih`,
  `mdr_estimasi`, `mdr_aktual`, `status`, `pg_provider`, `pg_ref`, `pg_payload`.
  Ditambah wadah: `kapal_id`, `jadwal_id`, snapshot `kode_kapal`/`nama_kapal`/`nama_pt`,
  dan `closing_kapal_id`.
- `tagihan_split` — pembagian per tagihan: `penerima_tipe` (pemilik/platform/
  agen), `nominal`, `status` (menunggu → ditahan → dikirim → selesai), `metode_kirim`
  (split_gateway | disbursement | transfer_manual), `bukti_url`.
- `rekening_penerima` — rekening pemilik: bank/e-wallet, `status` (draft →
  dokumen_lengkap → verifikasi → aktif), `pg_beneficiary_id`, `dokumen` (jsonb).
- `pesanan` — tambahan `tagihan_id`, `total_bayar`, `biaya_layanan`.
- `kapal.kode` — kode pendek unik per PT (awalan kode bayar), diisi otomatis dari
  nama kapal untuk data lama.
- `closing_kapal` — angka final satu kapal pada satu tanggal: `bagian_pemilik`,
  `bagian_platform`, `bagian_agen`, `total_mdr`, plus `status`
  (terbuka → dihitung → ditransfer → selesai/dibatalkan) dan `bukti_url`.
- `transfer_pemilik` + `transfer_pemilik_item` — satu batch transfer per PT untuk
  periode tertentu; item menyimpan rincian per kapal. Nomor rekening & nama
  rekening di-*snapshot* di header.
- View `v_wadah_kapal` (per kapal per tanggal) dan `v_wadah_pemilik` (per PT per
  tanggal) untuk halaman rekap.

> Tabel lama `pembayaran` (tunai/QRIS loket: `pesanan_id`, `metode`, `jumlah`,
> `referensi`) tetap dipakai dan **tidak diubah**. Tabel baru sengaja dinamai
> `tagihan` supaya laporan kasir yang sudah jalan tidak rusak.

RLS: tarif publik boleh dibaca; `tagihan`/`tagihan_split` hanya admin
penyewa + penerima dana + superadmin; `rekening_penerima` hanya pemiliknya.
Semua penulisan lewat server (service role).

Urutan migrasi (wajib berurutan): `supabase/fee-kanal.sql` →
`supabase/tagihan-online.sql` → `supabase/wadah-kapal.sql`. Berkas terakhir
menambah kolom wadah + trigger validasi, jadi butuh tabel `tagihan` dan `kapal`
yang sudah ada. Semuanya idempoten (aman dijalankan ulang).

## 8. Alur transaksi (setelah gateway aktif)

1. Pembeli memilih jadwal + kursi + metode bayar → server menghitung
   `rincianTagihan()` (dasar, biaya layanan, total).
2. `catatPembayaran()` membuat baris `tagihan` + `tagihan_split`, memanggil
   `provider.buatTagihan()`, lalu mengembalikan instruksi/QR/VA ke pembeli.
3. Tiket tetap `pending`. Kursi terkunci sesuai `expired_at`.
4. Gateway mengirim webhook → `tandaiLunas()` mengubah tagihan jadi `paid` dan
   split jadi `ditahan`. Baru setelah itu tiket dicetak/di-boarding.
5. **Pencairan per closing, bukan per tiket.** Setelah jadwal kapal ditutup:
   `tutupWadahKapal()` mengunci angka wadah → setelah semua kapal PT itu ditutup,
   `siapkanTransferPemilik()` membuat satu batch → admin transfer + unggah bukti
   (`tandaiTransferPemilik()`). Split gateway (kalau nanti dipakai) hanya
   mengubah *cara* memindahkan dana, **bukan** waktu pencairan.
6. Refund: buat baris `refund`, balikkan split (reverse split / tarik dari saldo
   pemilik), tiket dibatalkan. Kalau wadah sudah ditutup, koreksi dilakukan di
   batch transfer berikutnya (wadah lama tidak diedit).

## 9. Alur onboarding pemilik kapal

**Tahap A — sekarang (tanpa gateway, disbursement manual):**
1. Kesepakatan tertulis: harga dasar per rute, fee platform (3.000 offline /
   5.000 online), siapa menanggung biaya gateway (pembeli), jadwal pencairan.
2. Kumpulkan data: nama sesuai rekening, bank + nomor, NPWP (opsional), kontak.
3. Admin Utama mengisi `rekening_penerima` (status `draft` → `dokumen_lengkap`),
   Superadmin memverifikasi (`aktif`).
4. Penjualan online masuk ke rekening platform; bagi hasil dicatat sebagai utang
   (bukan pendapatan) dan ditransfer batch, bukti diunggah ke `bukti_url`.

**Tahap B — setelah gateway/split disetujui:**
1. Pemilik mendaftar sebagai sub-merchant/beneficiary: KTP pemilik/penganggung
   jawab, NIB/akta (kalau badan usaha), buku rekening (nama harus sama), email +
   HP aktif.
2. Verifikasi gateway 1–7 hari → isi `pg_beneficiary_id`.
3. Uji 1 transaksi kecil (mis. Rp10.000) → pastikan dana masuk ke rekening pemilik.
4. Baru split rule diaktifkan untuk operasional harian.

## 10. Roadmap

| Fase | Isi | Butuh gateway? |
|---|---|---|
| 0 (sekarang) | Skema DB, adapter, rumus biaya layanan, dokumen ini | Tidak |
| 1 | Checkout online memakai `catatPembayaran()` (+ `kapalId`/`jadwalId`) + halaman verifikasi admin + **wadah closing & transfer per PT** | Tidak |
| 2 | Adapter iPaymu (QRIS/VA/retail/e-wallet) + webhook + rekonsiliasi | Ya |
| 3 | Split payment otomatis (iPaymu split / Midtrans Iris untuk payout) | Ya + verifikasi beneficiary |

## 11. Pertanyaan wajib ke gateway (saat mendaftar)

1. Apakah **split payment** tersedia untuk akun ini? Penerima harus punya akun
   iPaymu sendiri, atau cukup rekening bank? Berapa maksimal penerima?
2. Biaya split: apakah ada fee tambahan di atas MDR channel?
3. Apakah MDR dipotong dari penerima tertentu (bisa diatur) atau proporsional?
4. Untuk disbursement: biaya per transfer, minimal nominal, jam operasional, dan
   apakah bisa batch (banyak penerima sekali kirim)?
5. Kontrak: apakah platform kami dianggap aggregator/marketplace? Dokumen apa yang
   harus disiapkan untuk pemilik kapal?
6. Refund & chargeback: siapa yang menanggung MDR, berapa lama dana kembali?
7. Apakah tarif di situs sudah termasuk PPN?

## 12. Dampak ke laporan

- `rekap-bagi-hasil` / `-kapal` harus membaca `tagihan_split` (nominal nyata)
  ketika sudah ada, dan tetap memakai snapshot `fee_platform` untuk data lama.
- Rekap berbasis wadah membaca `v_wadah_kapal` (per kapal) dan `v_wadah_pemilik`
  (per PT). Angka transfer diambil dari `closing_kapal`/`transfer_pemilik`, bukan
  dihitung ulang dari split, supaya yang ditransfer = yang dihitung saat closing.
- `backup-data` menambah tabel `tagihan`, `tagihan_split`, `closing_kapal`,
  `transfer_pemilik`, `transfer_pemilik_item`, `rekening_penerima`, `metode_bayar`.
- Biaya layanan **bukan** pendapatan platform: catat sebagai pass-through
  (masuk dan keluar dengan nominal sama), supaya laba tidak terlihat menggelembung.
