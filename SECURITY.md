# Keamanan Tiket Kapal

## Sudah diperbaiki (tahap 1)

1. **API Superadmin dikunci**
   - `/api/superadmin/tambah-penyewa`, `/api/superadmin/hapus-penyewa`, `/api/superadmin/status-penyewa`
     sekarang wajib header `Authorization: Bearer <access_token Supabase Auth>` milik profil `superadmin` yang aktif.
   - Sebelumnya siapa pun bisa POST tanpa login.

2. **Password tidak lagi disimpan sebagai teks biasa**
   - Kolom baru `profiles.password_hash` (PBKDF2-SHA256, 120.000 iterasi, salt acak).
   - Login diproses di server `/api/auth/login`, bukan membandingkan `password_plain` di browser.
   - Akun lama otomatis dimigrasikan saat login pertama (hash dibuat, plaintext dihapus).
   - Kolom password tidak lagi ditampilkan di dashboard. Reset password = password baru ditampilkan sekali.

3. **Hapus penyewa = nonaktifkan (soft delete)**
   - `aktif = false`, `sesi_aktif = false`; baris `profiles` dan `auth.users` TIDAK dihapus.
   - Data `kapal`, `jadwal`, `template_jadwal`, `pesanan`, laporan tetap utuh dan tidak yatim.
   - Bisa diaktifkan kembali (`/api/superadmin/status-penyewa`).
   - Tombol hapus di halaman tenant juga diubah menjadi nonaktifkan.

4. **Endpoint login dibatasi** (8 percobaan / 10 menit per IP+akun) dan error tidak membocorkan
   apakah akun terdaftar atau tidak.

## Wajib dijalankan sekali

Buka **Supabase Dashboard -> SQL Editor**, jalankan `supabase/security-hardening.sql`.

Setelah semua akun pernah login (semua password sudah jadi hash), kolom `password_plain` boleh di-drop.

Pastikan Environment Variables Vercel berisi:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (rahasia, hanya server)
- `SESI_TOKEN_SECRET` (string acak panjang, `openssl rand -hex 32` — tanpa ini token kolektor
  ditandatangani dengan service role key)
- `NEXT_PUBLIC_SITE_URL=https://www.lintasair.com` (canonical, robots, sitemap)
- `NEXT_PUBLIC_INDEXABLE=true` (hanya untuk domain resmi)

## Tahap 2 (SUDAH DITERAPKAN di kode) — jalankan `supabase/security-tahap2.sql`

Setelah SQL itu dijalankan:

- Anon key **tidak bisa menulis apa pun** (insert/update/delete dicabut). Pendaftaran
  tiket online, pembayaran, batal, dan pembuatan jadwal otomatis diproses API server.
- Staf (agen/petugas/admin) memakai **sesi Supabase Auth** yang dibuat saat login;
  RLS mengunci tulis ke penyewanya sendiri (`operator_id` / `jadwal_izin`).
- Fee platform hanya bisa diubah Superadmin; snapshot fee dipaksa trigger server;
  pesanan lunas tidak bisa dihapus; boarding ditolak kalau tiket belum `paid`.
- Pendaftaran mandiri (`/daftar-admin`, `/registrasi-admin`, `/superadmin/daftar`)
  ditutup — akun hanya dibuat pemilik platform.

**Setelah deploy + SQL:** semua staf harus **login ulang** sekali supaya sesi
Supabase Auth terpasang (tanpa itu mereka bisa masuk tapi tulis data ditolak).

## Tahap 3 (SUDAH DITERAPKAN di kode) — jalankan `supabase/security-tahap3-publik.sql`

Setelah SQL itu dijalankan:

- Anon **tidak bisa lagi** `select` tabel `pesanan`/`pembayaran` sama sekali
  (dulu `status='paid'` membuat semua tiket lunas semua tenant bisa diunduh).
- `/pembayaran`, `/pembayaran/cash`, `/cek-tiket`, `/etiket` memakai RPC terbatas:
  `publik_pesanan_ids(uuid[])` (hanya ID yang diketahui, lunas atau < 15 menit)
  dan `publik_tiket_hp(text)` (hanya tiket milik nomor HP yang dimasukkan,
  tanpa NIK/HP di hasil). Jalankan `supabase/publik-etiket-balita.sql` setelah
  tahap 3 agar hasilnya juga memuat `is_balita`, `induk_id`,
  `grup_transaksi_id`, dan `kanal` (balita menempel ke tiket orang tuanya).
- `/api/publik/*` wajib header `x-lintasair-channel: web` + Origin/Referer domain
  resmi (opsional tambah domain lain lewat env `PUBLIK_ALLOWED_ORIGINS`, dipisah koma)
  dan dibatasi rate limit per IP. Ini **bukan** API key — memang dipakai browser pembeli.
- API integrasi tenant `/api/integrasi/*` (key per tenant, tabel `api_klien`) —
  lihat `docs/API-INTEGRASI.md`.

Sisa risiko (tahap 4, perlu keputusan bisnis):

1. Pembayaran online masih **simulasi** (belum payment gateway), jadi status `paid`
   bisa dibuat siapa pun yang menekan "Saya Sudah Bayar".
2. Tiket masih bisa dipakai ulang kalau staff sengaja membuat pesanan `paid` tanpa uang
   (internal tenant) — perlu rekonsiliasi kas / gateway.
3. Guard `/api/publik/*` berbasis Origin + header — bisa ditembus klien yang sengaja
   memalsukan header (curl). Mitigasi: rate limit per IP + harga selalu dari server.

## Tahap 3b (SUDAH DIJALANKAN 25 Nov 2026) — Storage bucket `kapal` dikunci

Temuan audit: dengan **anon key** (kunci yang terlihat siapa pun di browser) file bisa
di-upload ke bucket `kapal` (HTTP 200), file-nya publik bisa dibaca, tetapi anon tidak bisa
menghapusnya (403). Artinya siapa pun bisa menitipkan file apa pun (malware/phishing) di
project Supabase dan pemilik tidak bisa membersihkannya dari sisi penyerang.

Policy sekarang pada `storage.objects` untuk `bucket_id = 'kapal'`:

| Operasi | Anon | Authenticated (staf login) |
|---|---|---|
| `select` (lihat foto) | ✅ | ✅ |
| `insert` (upload) | ❌ | ✅ |
| `update` | ❌ | ✅ |
| `delete` | ❌ | ✅ |

Bukti uji ulang setelah SQL dijalankan: upload anon ditolak
(`new row violates row-level security policy`), daftar/lihat file tetap 200.

Catatan: aplikasi saat ini **belum punya fitur upload foto kapal**; kalau nanti dibuat,
upload harus lewat staf yang sudah login, dan ukuran/tipe file wajib dibatasi di server.

## Tahap 3c (SUDAH DITERAPKAN 25 Nov 2026) — header keamanan + tutup `?preview=true`

**a. Header keamanan** (`next.config.ts` → `headers()`, berlaku semua route):

| Header | Nilai |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`; `script-src` izinkan `'unsafe-inline'` (bootstrap Next.js) + `'wasm-unsafe-eval'` (tesseract OCR) + jsdelivr/unpkg; `connect-src` ke `*.supabase.co`, `wss:`, `data:` & `blob:` (e-tiket mengolah PNG hasil html-to-image di browser); `worker-src blob:`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self)` (scan KTP), `geolocation=(self)` (isi otomatis kota asal), sisanya `()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

HSTS tidak ditulis ulang karena Vercel sudah mengirim `max-age=63072000`.

Bukti uji (Chrome headless via DevTools Protocol, 11 halaman: `/`, `/login`, `/cek-tiket`,
`/etiket`, `/form`, `/scan`, `/syahbandar`, dan 4 URL pratinjau): **0 pelanggaran CSP**,
**0 request gagal**, request `rest/v1/master_kota` tetap **200**, halaman tetap hidrasi.
Kontrol A/B: hasil render halaman `/` di lokal identik dengan produksi.

Uji ulang kapan saja setelah mengubah `headers()`:

```bash
npm run build && npx next start -p 3100
node scripts/uji-header.mjs http://localhost:3100/     # exit 1 kalau ada yang diblokir
```

**b. `?preview=true` tidak lagi mematikan guard.** Sebelumnya `SessionGuard` langsung
`return` bila parameter itu ada, jadi siapa pun bisa membuka halaman staf tanpa login
(data tetap terlindungi RLS, tapi UI internal terbuka dan `agen/jual-tiket` memalsukan
profil agen di browser). Sekarang ada `bolehModePratinjau()` di `lib/supabase.ts`:
pratinjau hanya sah bila browser memegang sesi Supabase Auth milik profil
`superadmin`/`admin_utama` yang aktif; selain itu dialihkan ke `/superadmin`.

Bukti uji: `/dashboard?preview=true`, `/agen/jual-tiket?preview=true`,
`/laporan?preview=true`, `/cetak-ulang?preview=true` tanpa sesi → konsol mencatat
`Mode pratinjau ditolak: bukan sesi Superadmin.` dan halaman dialihkan.

## Tahap 3d (SUDAH DITERAPKAN 25 Nov 2026) — batas pesanan pending per nomor HP

`POST /api/publik/pesan` menghitung lebih dulu tiket `status = 'pending'` yang
`waktu_expired`-nya belum lewat untuk nomor HP yang sama, lalu menolak dengan
HTTP 429 bila totalnya akan melewati batas.

- Batas bawaan **10 tiket pending per nomor HP**; bisa diubah lewat env
  `BATAS_PENDING_PER_HP` tanpa mengubah kode.
- Hitungan memakai database, bukan memori proses → berlaku di semua instance
  Vercel dan tidak ter-reset saat deploy.
- Nomor dicocokkan dalam beberapa varian (`08…`, `628…`, digit mentah) lewat
  `varianNomorHp()` di `lib/nomorHp.ts`, supaya format penulisan berbeda tidak
  bisa dipakai untuk melewati batas.
- Pengecekan dilakukan **sebelum** kursi dikunci, jadi permintaan yang ditolak
  tidak pernah menahan kursi. Kursi tetap dilepas otomatis setelah 15 menit oleh
  `lepasKunciKedaluwarsa()`.

Sisa risiko: nomor HP belum diverifikasi OTP, jadi penyerang masih bisa memakai
banyak nomor acak. Batas ini menaikkan biaya serangan (satu nomor = satu
pesanan), bukan menutupnya; penutup penuh butuh OTP atau pembayaran di muka.

## Tahap 3e (SUDAH DITERAPKAN 25 Nov 2026) — isian pembeli & berkas e-tiket

Tiga keluhan produksi yang bukan soal kebocoran data, tapi tetap berdampak pada
keamanan operasional (penjualan hilang) dan kebocoran informasi ke layar pembeli:

- **Salah isi NIK tidak lagi melempar pembeli ke Beranda.** Di `/form`, satu state
  `error` dipakai untuk dua hal sekaligus: gagal memuat jadwal/kursi (fatal) dan
  isian kurang tepat. Akibatnya satu NIK 15 digit mengganti seluruh form dengan
  layar "Kembali ke Beranda" dan semua isian hilang. Sekarang `error` hanya untuk
  kegagalan muat, sedangkan `errorForm` menampilkan pesan di dekat tombol, form
  tetap terpasang, dan fokus berpindah ke kolom yang salah.
- **"Gagal menyimpan gambar: Failed to fetch" bukan bug jaringan.** `fetch()` ke
  `data:` URL diatur CSP `connect-src`; karena skema `data:` belum diizinkan,
  Chrome menolak sebelum aplikasi sempat memproses gambar. Sekarang blob dibuat
  dengan decode base64 lokal (`dataUrlKeBlob()` di `lib/gambarTiket.ts`, tanpa
  jaringan) **dan** `connect-src` mengizinkan `data:`/`blob:` untuk kebutuhan lain.
  Untuk browser tanpa Web Share (mis. bawaan Huawei), gambar ditampilkan besar
  agar bisa "tekan & tahan → Simpan gambar".
- **PDF e-tiket terpotong di sisi kanan.** Bukan masalah tangkapan layar: jsPDF
  dengan `orientation: 'portrait'` selalu menaruh sisi **terpendek** sebagai lebar
  halaman. Tiket yang lebih lebar daripada tinggi (kartu pendek) diletakkan pada
  halaman yang lebih sempit, sehingga gambar keluar halaman dan terlihat
  terpotong (paling kentara di tablet). Sekarang `lib/pdfTiket.ts` memilih
  orientasi sesuai bentuk gambar; halaman dan gambar jadi sama persis.
- **Gambar & PDF diambil dari satu wadah tetap 350px** (`tangkapDariRender()`),
  bukan dari kartu yang sedang tampil. Kartu tampil ikut aturan `md:` milik
  layar, sehingga hasil tangkapan berbeda antara HP dan tablet.

Bukti uji (Chrome headless, emulasi HP 390×844@3, tablet 1024×1366@2, laptop
1440×900@1): gambar 704×668 (HP) dan 704×992 (tablet/laptop) dengan kolom paling
kanan & kiri putih penuh (tidak terpotong); PDF `MediaBox 938,67×890,67 pt`
untuk gambar 704×668 dan `938,67×1322,67 pt` untuk 704×992 — rasio halaman sama
dengan gambar. Sebelum perbaikan, halaman 704×668 adalah `890,67×938,67 pt`
(tertukar → sisi kanan terpotong 36 px). `/form`: NIK 5 digit → tetap di `/form`,
NIK & nama & HP utuh, pesan "harus 16 digit"; ditolak server ("Nomor HP tidak
valid") → form tetap utuh juga.

## Masih terbuka (belum diperbaiki)

1. **Rate limit disimpan di memori proses** — tiap instance Vercel menghitung sendiri dan
   ter-reset saat deploy.
2. **`typescript.ignoreBuildErrors: true`** di `next.config.ts` — error tipe tidak
   menggagalkan build.
3. **Kolom `password_plain` masih ada** (isinya 0 baris per 25 Nov 2026). Boleh di-drop
   setelah fallback plaintext di `lib/password.ts` dan `app/api/superadmin/tambah-penyewa`
   dibersihkan.
4. **CSP masih mengizinkan `'unsafe-inline'` untuk skrip** — konsekuensi Next.js tanpa nonce.
   Kalau nanti pindah ke nonce/hash, `script-src` bisa diperketat.
5. **Nomor HP pembeli belum diverifikasi OTP** — batas pending per nomor sudah ada
   (Tahap 3d), tapi nomor palsu masih bisa dipakai berganti-ganti.

## Backup

Backup data harian dan cara restore ada di `docs/BACKUP.md`. Backup memuat NIK/HP/hash
password — permission file `600`, jangan di-commit.

