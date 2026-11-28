# Environment Demo (demo.lintasair.com)

Demo adalah **instalasi baru dari sistem yang sama**, bukan salinan database
produksi. Kode, skema, RLS, fungsi, dan alur transaksi sama; isi database demo
dibiarkan kosong.

## Aturan yang tidak boleh dilanggar

1. Demo memakai **project Supabase terpisah** dari produksi.
2. Tidak ada **data operasional contoh**: tidak ada kapal, jadwal, kursi,
   penumpang, pesanan, tiket, pembayaran, manifest, fee, atau file storage
   contoh.
3. Demo **tidak memiliki Superadmin**. `/superadmin`, `/dashboard-superadmin`,
   dan `/api/superadmin/*` selalu 404 di demo (`proxy.ts` + `DEMO_MODE=true`).
   Tidak ada flag pembuka; kalau butuh Superadmin, pakai Superadmin REAL.
4. Penyewa demo dibuat dan dipantau dari Superadmin REAL lewat server:
   - `GET /api/superadmin/demo/penyewa` — daftar penyewa demo
   - `POST /api/superadmin/demo/tambah-penyewa` — buat akun pemilik kapal demo
   - `PATCH /api/superadmin/demo/penyewa/[id]` — edit akun demo (nama, PT, HP,
     email login, password, status aktif/nonaktif)
   - `DELETE /api/superadmin/demo/penyewa/[id]` — hapus permanen akun demo +
     seluruh data miliknya di database demo
   - `GET /api/superadmin/demo/fee?bulan=YYYY-MM` — fee simulasi
   Browser tidak pernah memegang service role key demo.
5. Fee demo selalu diberi label **SIMULASI — bukan pendapatan nyata**.

## Isi demo

| Ada | Tidak ada |
|---|---|
| Skema tabel + constraint + index | Data kapal/jadwal/kursi |
| RLS, policy, function, trigger | Pesanan/tiket/pembayaran/manifest |
| Master referensi (kota/rute) | Fee dan audit log transaksi |
| Pengaturan platform/teks/sistem | File storage/upload nyata |
| Akun penyewa demo (dibuat dari Superadmin REAL) | Akun Superadmin |

Akun bootstrap hanya boleh satu akun netral untuk masuk pertama kali. Kalau
tidak dipakai, biarkan `profiles` kosong dan daftar lewat halaman registrasi
biasa.

## Environment REAL (www.lintasair.com)

```env
# Kredensial database REAL yang sudah ada
NEXT_PUBLIC_SUPABASE_URL=https://<real>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Server-only: untuk membaca database demo dari halaman Superadmin REAL
DEMO_SUPABASE_URL=https://<demo>.supabase.co
DEMO_SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_DEMO_URL=https://demo.lintasair.com
DEMO_MODE=false
```

## Environment DEMO (demo.lintasair.com)

```env
# Kredensial project DEMO, bukan project real
NEXT_PUBLIC_SUPABASE_URL=https://<demo>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_SITE_URL=https://demo.lintasair.com
NEXT_PUBLIC_INDEXABLE=false
DEMO_MODE=true
```

Demo **tidak punya env Superadmin** dan tidak punya akun Superadmin. Akun
pemilik kapal demo dibuat dari Superadmin REAL (lihat bagian "Membuat penyewa
demo dari Superadmin REAL").

Jangan mengisi `DEMO_SUPABASE_URL` di deployment demo dengan URL real.

## Lokal: dev = demo (WAJIB)

Kredensial produksi **tidak boleh** ada di `.env.local`, karena Next.js memuat
file itu untuk `dev`, `build`, maupun `start` — artinya `npm run dev` di laptop
bisa menulis ke database asli (pernah hampir terjadi saat menguji
`POST /api/publik/bayar`).

Pemisahan file yang dipakai sekarang:

| File (gitignored) | Dimuat oleh | Isi |
|---|---|---|
| `.env.development.local` | `next dev` saja | project **DEMO** (`wymrqolithdsreganqpr`), `SUPABASE_SERVICE_ROLE_KEY` sengaja **kosong** |
| `.env.production.local` | `next build` / `next start` saja | project **REAL** (`bhbxupwrkyuymzozgvvv`) |

Aturan:

1. `next dev` tidak bisa melihat kredensial produksi sama sekali — bukan
   "ditimpa", memang tidak dimuat.
2. Selama `SUPABASE_SERVICE_ROLE_KEY` di file dev kosong, route yang butuh hak
   tulis (mis. `/api/publik/*`, `/api/superadmin/*`) menjawab
   *"service key Supabase belum diatur"*. Itu **fitur**, bukan bug: gagal
   terang-terangan lebih baik daripada diam-diam menulis ke produksi.
3. Kalau perlu menguji route tulis di lokal, isi dengan service_role **demo**
   (dashboard DEMO → Project Settings → API → `service_role`), jangan pernah
   dengan key produksi.
4. Halaman yang sedang diuji di lokal: `http://localhost:3000`
   (`NEXT_PUBLIC_SITE_URL` di file dev). Untuk port lain, jalankan
   `next dev -p 3123` **dan** sesuaikan nilainya agar guard origin
   `/api/publik/*` tidak menolak.
5. Deployment Vercel tidak terpengaruh oleh file lokal — env di sana diisi lewat
   dashboard.

### Membuka demo online tanpa localhost (sementara)

Kalau hanya butuh link yang bisa dibuka dari HP saat ini juga, tanpa membuat
project Vercel:

```bash
bash scripts/demo-online.sh
```

Skrip memakai `.env.development.local` (project DEMO), menolak jalan kalau file
itu menunjuk database REAL, lalu mencetak satu URL
`https://<acak>.trycloudflare.com`. Link ini **sementara**: berubah setiap
dijalankan dan mati saat laptop/server dimatikan. Untuk link tetap
`https://demo.lintasair.com`, pakai langkah C (project Vercel terpisah).

**Penting:** demo harus menjadi **project Vercel terpisah** dari real. Jangan
menambahkan `demo.lintasair.com` sebagai domain kedua di project real, karena
environment variable Vercel berlaku untuk seluruh project — `DEMO_MODE=true`
akan ikut menutup area Superadmin di real.

## Membangun database demo (setelah schema-only dump tersedia)

Repo ini hanya berisi migrasi incremental; **belum ada base schema** yang bisa
membangun database kosong dari nol. Langkah yang benar:

1. Ambil **schema-only dump** dari project real (tanpa data):
   `pg_dump --schema-only --no-owner --no-privileges ... > schema-real.sql`
2. Buat project Supabase demo baru.
3. Jalankan `schema-real.sql` di SQL Editor demo.
4. Jalankan migrasi incremental dari repo dengan urutan aman:
   `security-hardening` → `security-tahap2` → `security-tahap2b-grant` →
   `security-tahap3-publik` → `kursi-segmen`.
5. **Jangan** menjalankan `security-tahap4-rls.sql` hanya di demo kalau di real
   belum dijalankan. Tujuannya demo punya skema yang sama dengan real. Jalankan
   tahap 4 di **keduanya** setelah disetujui, atau lewati dulu.
6. **Jangan** menjalankan seed/data contoh apa pun.
7. Verifikasi dengan `node scripts/verify-demo-clean.mjs`.

## Akun bootstrap demo (wajib 1 akun admin)

Pendaftaran mandiri (`/daftar-admin` dan `/registrasi-admin`) **ditutup**, jadi
demo tidak bisa dimulai dari `profiles` kosong lalu mendaftar lewat UI. Buat
satu akun `admin_utama` netral langsung lewat SQL Editor demo, setelah skema
selesai dan sebelum login pertama.

1. Buat hash password dengan perintah Node (sama dengan hash aplikasi):

   ```bash
   node -e 'const {randomBytes,pbkdf2Sync}=require("crypto");const p=process.argv[1];const s=randomBytes(16);const h=pbkdf2Sync(p,s,120000,32,"sha256");console.log("pbkdf2$120000$"+s.toString("base64")+"$"+h.toString("base64"))' 'PASSWORD_DEMO'
   ```

2. Jalankan di SQL Editor **database demo**:

   ```sql
   insert into public.profiles
     (id, email, nama, nama_perusahaan, nomor_hp, role, aktif, password_hash)
   values
     (gen_random_uuid(), 'demo@lintasair.com', 'Admin Demo',
      'Demo Lintas Air', null, 'admin_utama', true, 'HASH_DARI_LANGKAH_1');
   ```

3. Login di `https://demo.lintasair.com/login` memakai email
   `demo@lintasair.com` dan password tadi. Pada login pertama, server membuat
   akun Supabase Auth otomatis dan menyimpan `auth_user_id`.

Akun ini **bukan** Superadmin. Demo tidak punya Superadmin; penyewa tambahan
dibuat dari Superadmin REAL (lihat bagian berikut). Setelah akun bootstrap ada,
`npm run demo:verify` tetap harus lulus (script hanya melarang data operasional).

## Membuat penyewa demo dari Superadmin REAL

Pemilik demo sering butuh **beberapa akun penyewa sekaligus** (mis. 5 pemilik
kapal yang mau mencoba). Semuanya dibuat dari **REAL**, di
`https://www.lintasair.com/dashboard-superadmin/penyewa` → kartu
**Daftar Penyewa Demo** (bukan login ke demo, bukan SQL):

1. Pastikan project Vercel REAL punya env `DEMO_SUPABASE_URL`,
   `DEMO_SUPABASE_SERVICE_ROLE_KEY`, dan `NEXT_PUBLIC_DEMO_URL`. Tanpa itu
   halaman menampilkan "Demo belum terhubung" (HTTP 503 dari API).
2. Login sebagai Superadmin REAL, buka **Data Penyewa → Daftar Penyewa Demo**,
   klik **+ Tambah Penyewa Demo**, isi nama pemilik, nama perusahaan, email,
   nomor HP/WA, dan password (minimal 6 karakter).
3. Server REAL memanggil `POST /api/superadmin/demo/tambah-penyewa` dengan
   service role key demo (tidak pernah dikirim ke browser). Endpoint membuat
   `auth.users` demo (`email_confirm=true`) + baris `profiles`
   (`role='admin_utama'`, `aktif=true`, `password_hash` PBKDF2). Kalau insert
   profil gagal, user Auth demo dihapus lagi (tidak ada akun setengah jadi).
4. Berikan email + password itu ke pemilik. Dia login di `https://<demo>/login`
   (bukan `/superadmin`) dan mengelola kapalnya sendiri.
5. `npm run demo:verify` tetap lulus: yang dihitung hanya akun `admin_utama`
   demo, dan tabel operasional tetap kosong sampai pemilik mengisinya.

Pengaman: endpoint menolak non-Superadmin (401), email tidak valid (400),
password < 6 karakter (400), nomor HP tidak valid (400), dan nomor HP yang
sudah dipakai akun demo (409). `DEMO_SUPABASE_URL` tidak boleh sama dengan
`NEXT_PUBLIC_SUPABASE_URL` dan key demo tidak boleh sama dengan key REAL —
dicek `lib/demoServer.ts`.

### Edit & hapus penyewa demo

Di tabel **Daftar Penyewa Demo** setiap baris punya tombol **Edit** dan
**Hapus** (sama seperti Data Penyewa REAL):

- **Edit** (`PATCH /api/superadmin/demo/penyewa/[id]`) mengubah nama pemilik,
  nama perusahaan, nomor HP, email login, password (opsional — kosongkan kalau
  tidak diganti), dan status aktif/nonaktif. Email/password ditulis lewat
  GoTrue demo (`email_confirm=true`), profil demo ikut diperbarui
  (`password_hash` PBKDF2). Kalau email sudah dipakai akun demo lain, Supabase
  menolak dan profil tidak berubah. Nonaktifkan akun = staf/petugas demo di
  bawahnya ikut nonaktif, data tidak dihapus.
- **Hapus** (`DELETE /api/superadmin/demo/penyewa/[id]`) wajib mengetik nama
  perusahaan (atau nama pemilik) di kotak konfirmasi. Server menjalankan
  `hapus_penyewa_total` di database demo (kapal, jadwal, kursi, pesanan,
  pembayaran, refund, template, master rute, pengaturan, audit log, staf,
  profil) lalu menghapus akun login demo. Catatan `penyewa_dihapus` yang
  ditulis fungsi itu dibersihkan lagi supaya `demo:verify` tetap **BERSIH**.

Keduanya hanya menerima akun `role='admin_utama'` demo; akun staf/petugas demo
tidak bisa diubah/dihapus dari halaman ini.

## Status demo saat ini (dibangun 27 Nov 2026)

Skema demo **disamakan dengan REAL tanpa membawa satu baris data pun**. Karena repo
ini belum punya base schema, katalog REAL dibaca lebih dulu (hanya `pg_catalog`,
tanpa menyentuh tabel data), lalu DDL-nya diputar ulang ke project demo. Hasil
pembandingan otomatis demo vs real: **0 perbedaan** pada tabel (17), kolom (154),
constraint (35), index (33), fungsi (27), trigger (12), policy (41), dan hak akses
(47 objek).

Migrasi yang tercatat di project demo (`supabase_migrations`):

| # | Nama migrasi | Isi |
|---|---|---|
| 1 | `demo_base_01_extensions_tables` | ekstensi `btree_gist` + `pgcrypto`, 16 tabel |
| 2 | `demo_base_02_constraints` | primary/unique/check/exclude/foreign key |
| 3 | `demo_base_03_functions_indexes_triggers` | 26 fungsi, 33 index, 12 trigger |
| 4 | `demo_base_04_rls_policies_grants` | RLS aktif di 16 tabel, 41 policy, hak akses |
| 5 | `demo_base_05_grants_sync` | hak akses tabel disamakan persis dengan REAL |
| 6 | `security_hardening` | `supabase/security-hardening.sql` |
| 7 | `security_tahap2` | `supabase/security-tahap2.sql` |
| 8 | `security_tahap2b_grant` | `supabase/security-tahap2b-grant.sql` |
| 9 | `security_tahap3_publik` | `supabase/security-tahap3-publik.sql` |
| 10 | `demo_fix_rpc_publik` | `publik_pesanan_ids` + `publik_tiket_hp` versi terbaru (versi di tahap 3 lebih tua dari REAL) |
| 11 | `demo_seed_referensi` | referensi + akun bootstrap |
| 12 | `penyewa_dihapus` | pasang `penyewa_dihapus` + `hapus_penyewa_total` (fitur Hapus Total Penyewa) dengan pengaman hak akses |

`security-tahap4-rls.sql` **tidak dijalankan** (di REAL juga belum), sesuai
aturan "demo harus sama dengan real".

Data yang ada di demo (semuanya referensi, bukan operasional):

| Tabel | Baris | Keterangan |
|---|---|---|
| `master_kota` | 12 | referensi wilayah, `operator_id` NULL |
| `pengaturan_teks` | 4 | label menu per peran |
| `pengaturan_sistem` | 1 | baris global (`operator_id` NULL) |
| `pengaturan_platform` | 1 | fee 0 (SIMULASI) |
| `profiles` | 1 | akun bootstrap `demo@lintasair.com` (`admin_utama`); bertambah kalau Superadmin REAL menambah penyewa demo |
| kapal/jadwal/kursi/pesanan/pembayaran/refund/audit/api_klien/penyewa_dihapus | 0 | wajib kosong |

Akun bootstrap sudah diuji: login benar → HTTP 200 + profil; password salah →
HTTP 401. Konfirmasi kebersihan:

```bash
DEMO_SUPABASE_URL=https://wymrqolithdsreganqpr.supabase.co \
DEMO_SUPABASE_SERVICE_ROLE_KEY=... npm run demo:verify
# HASIL: BERSIH — tidak ada data operasional di demo.
```

Hasil uji build mode DEMO (27 Nov 2026, tanpa membuka pintu Superadmin):

| Permintaan | Hasil |
|---|---|
| `/`, `/login`, `/cari-tiket` | 200 + strip "Demo — data simulasi" |
| `/superadmin`, `/superadmin/pusat-kontrol`, `/superadmin/pusat-kontrol/kota`, `/superadmin/pusat-kontrol/admin/manifest`, `/dashboard-superadmin`, `/api/superadmin/tambah-penyewa` | 404 "tidak tersedia di lingkungan demo" |
| `/superadmin/pusat-kontrol/etiket`, `/superadmin/pusat-kontrol/admin/petugas` (+ `keberangkatan`) | 200 (halaman tenant, sengaja dibuka) |

Hak akses di REAL dan DEMO sudah diperiksa sama: `anon` tidak bisa `select`/
`truncate` tabel `penyewa_dihapus` dan tidak bisa memanggil
`hapus_penyewa_total`; `authenticated` juga tidak bisa memanggil fungsi itu;
hanya `service_role` yang bisa. Uji tambahan: dengan JWT Admin Utama demo,
insert akun petugas berhasil (RLS `tulis_profil_insert` lolos), sedangkan sebagai
`anon` ditolak `permission denied for table profiles`.

## Dua lapisan pengaman yang dipasang di kode

1. `lib/demoGuard.ts` — kalau `DEMO_MODE=true` sementara URL database menunjuk
   project REAL, aplikasi **menolak jalan** (build/permintaan gagal dengan pesan
   `[DEMO] ... menunjuk ke project Supabase REAL`). Dipakai di `lib/supabase.ts`
   dan `lib/serverAuth.ts`, jadi salah setting env di Vercel tidak bisa diam-diam
   membuka data produksi.
2. `components/DemoBadge.tsx` — strip "Demo — data simulasi, bukan data asli" yang
   dirender di `app/layout.tsx`, sehingga muncul di **setiap halaman** saat
   `DEMO_MODE`/`NEXT_PUBLIC_DEMO_MODE=true`, dan hilang saat halaman dicetak
   (`print:hidden`). Di REAL tidak muncul sama sekali.

3. Pintu rahasia login: **klik 3x judul "LintasAir"** di beranda (`app/page.tsx`)
   membuka `/login` petugas/agen dan aktif di REAL maupun DEMO (jeda antar klik
   maksimal 2 detik). **Klik 3x tombol "Cari Tiket"** di `/cek-tiket` membuka
   `/superadmin` dan **hanya aktif di REAL**; di DEMO pintu itu dimatikan
   (`NEXT_PUBLIC_DEMO_MODE=true`) supaya pengunjung demo tidak tersandung ke
   pintu pemilik platform.

`proxy.ts` menutup `/superadmin`, `/dashboard-superadmin`, dan `/api/superadmin/*`
dengan 404 di demo **selalu** (tidak ada flag pembuka), kecuali dua halaman
milik penyewa yang secara folder berada di dalam `/superadmin`:

| Halaman | Kenapa dibuka |
|---|---|
| `/superadmin/pusat-kontrol/admin/petugas` (+ sub-halaman) | menu **Manajemen Petugas** di dashboard Admin Utama (bikin akun petugas/keberangkatan/kolektor) |
| `/superadmin/pusat-kontrol/etiket` | halaman cetak e-tiket; semua staf yang membuka `/etiket` dialihkan ke sini |

Sisanya tetap 404: Pusat Kontrol, Data Penyewa, Kota, Online, Agen, Manifest,
Akun Petugas, dan Syahbandar superadmin.

## Alur uji coba pemilik kapal (dari login sampai tiket tercetak)

Ini urutan yang bisa kamu suruh ke pemilik kapal waktu mencoba demo. Kalau ada
beberapa pemilik kapal, buatkan satu akun Admin Utama per pemilik lewat
Superadmin REAL → Data Penyewa → Daftar Penyewa Demo (lihat bagian "Membuat
penyewa demo dari Superadmin REAL"); pendaftaran mandiri di `/daftar` memang
ditutup.

1. **Masuk** — buka `/login`, isi email + password demo. Setelah masuk,
   `/dashboard` menampilkan semua menu Admin Utama.
2. **Daftarkan kapal** — menu *Daftar Armada Kapal* (`/kapal`): nama kapal,
   kode, jumlah kursi.
3. **Buat template jadwal** — menu *Manajemen Jadwal* (`/template-jadwal`):
   rute asal–tujuan, jam berangkat, harga, dan kapal. Template inilah yang
   melahirkan jadwal harian per tanggal.
4. **Buat akun staf** — menu *Manajemen Petugas*
   (`/superadmin/pusat-kontrol/admin/petugas`): pilih jenis petugas
   (loket / keberangkatan / kolektor), isi nama + nomor HP + password. Staf
   login memakai nomor HP itu.
5. **Buat akun agen** (kalau mau uji penjualan lewat agen) — menu *Manajemen
   Agen* (`/agen-tenant`).
6. **Uji jual tiket** — login sebagai agen/petugas, buka *Jual Tiket*
   (`/agen/jual-tiket` atau `/loket-jual`): pilih jadwal → isi penumpang →
   bayar → **Cetak**. Halaman cetak memakai `/superadmin/pusat-kontrol/etiket`
   yang tetap terbuka di demo, jadi QR dan PDF tiket tetap jalan.
7. **Uji boarding** — login petugas keberangkatan, buka `/scan` untuk memindai
   QR, lalu lihat daftar penumpang di `/pusat-laporan-keberangkatan`.
8. **Uji laporan** — kembali sebagai Admin Utama: *Laporan Penjualan*
   (`/laporan-penjualan-admin`), *Rekap Bagi Hasil* (`/rekap-bagi-hasil`), dan
   *Audit Log* (`/audit`) sekarang terisi karena aktivitas tadi.
9. **Uji sisi penumpang** — tanpa login: `/cari-tiket` untuk beli tiket online,
   lalu `/cek-tiket` untuk melihat tiket memakai nomor HP.
10. **Uji syahbandar** (opsional) — login akun ber-role `syahbandar`, buka
    `/syahbandar`.

Setiap kali demo dipakai, isinya jadi kotor (ada kapal, jadwal, pesanan). Itu
normal. Untuk mengembalikan demo ke kondisi bersih, hapus data lewat SQL Editor
project demo — **jangan** pernah mengarahkan `npm run demo:verify` ke database
REAL.

## Cara mengurus demo (panduan langkah demi langkah)

### A. Memastikan MCP Supabase nyambung setelah ganti setting

1. Simpan `cline_mcp_settings.json` (sudah berisi PAT + `project_ref` demo).
2. Di VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.
3. Buka panel **Cline → MCP Servers**. `supabase` harus tersambung dan **tidak**
   memunculkan jendela "Authenticate/Allow" OAuth.
4. Uji cepat: minta Cline "list tabel di project Supabase". Yang muncul harus
   tabel demo (17 tabel), bukan tabel real.
5. Kalau masih minta OAuth: pastikan blok `"oauth"` sudah tidak ada, `"type"`
   bernilai `"streamableHttp"`, lalu reload lagi.

### B. Mengganti token akses Supabase (PAT)

Token yang sekarang terpasang sempat tertulis di chat, jadi sebaiknya diganti.

1. Buka `https://supabase.com/dashboard` → klik foto profil → **Access Tokens**.
2. **Generate new token**, beri nama misal `cline-demo-2026`, salin (hanya
   muncul sekali).
3. **Revoke** token lama (`sbp_fc4a...`) supaya tidak bisa dipakai lagi.
4. Edit `~/.cline/data/settings/cline_mcp_settings.json`, ganti
   `Authorization: Bearer sbp_...` dengan token baru. **Jangan hapus**
   `?project_ref=wymrqolithdsreganqpr` di URL — itu yang mengunci MCP supaya
   tidak bisa menyentuh database REAL.
5. Reload VS Code lalu ulangi uji bagian A.

### C. Memasang env deployment demo (Vercel)

Project Vercel demo wajib memakai project **Supabase demo**, bukan real.

| Variabel | Nilai | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wymrqolithdsreganqpr.supabase.co` | dashboard Supabase demo → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key demo | aman tampil di browser |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key demo | **jangan** pakai punya real |
| `DEMO_MODE` | `true` | wajib ada saat build |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | agar penanda DEMO ikut di halaman statis |
| `NEXT_PUBLIC_INDEXABLE` | `false` | demo tidak diindeks Google |
| `NEXT_PUBLIC_SITE_URL` | `https://demo.lintasair.com` | untuk metadata/robots |

Langkahnya:

1. Vercel → project demo → **Settings → Environment Variables**.
2. Isi satu per satu sesuai tabel, centang Production + Preview + Development.
3. **Deployments → Redeploy** supaya env baru ikut terpakai. `DEMO_MODE` dibaca
   saat build, jadi tanpa redeploy penanda DEMO tidak akan muncul.
4. Cek hasilnya: halaman utama menampilkan strip kuning "Demo — data simulasi",
   dan `/superadmin` harus 404 "tidak tersedia di lingkungan demo".
5. Kalau strip DEMO tidak muncul padahal env sudah diisi: build-nya lama, redeploy
   ulang. Kalau yang muncul error `[DEMO] ... menunjuk ke project Supabase REAL`,
   berarti `NEXT_PUBLIC_SUPABASE_URL` masih URL real — itu pengaman bekerja,
   perbaiki env-nya.

### C.1 Status deployment demo (dipasang 28 Nov 2026)

| Hal | Nilai |
|---|---|
| Project Vercel | `lintasair-demo` (`prj_HssG104nNDH2dyAWV3psFBE5KJvL`), tim `tiket-kapal` |
| URL sementara (langsung jalan) | `https://lintasair-demo.vercel.app` |
| Domain | `demo.lintasair.com` sudah ditambahkan ke project, **menunggu CNAME** |
| CNAME di Rumahweb | tipe `CNAME`, host `demo`, value `77d179e112f27c60.vercel-dns-017.com` |
| Deployment Protection | **dimatikan** (kalau aktif, semua halaman 302 ke login Vercel) |
| Deploy ulang | `bash scripts/demo-deploy.sh` (butuh `~/.vercel-token`) |

Deploy demo memakai **isi folder lokal** (bukan commit GitHub), supaya perubahan
yang belum di-commit tetap bisa dilihat pemilik. Build berjalan di Vercel; file
`.env*` lokal tidak ikut ter-upload (masuk `.gitignore`), env produksi dibaca
dari dashboard Vercel (10 variabel sudah diisi untuk Production/Preview/Development).

Setelah CNAME aktif, cek `https://demo.lintasair.com`: strip kuning DEMO muncul,
klik 3x judul "LintasAir" menuju `/login` petugas, pintu 3x tombol "Cari Tiket"
**tidak** membuka `/superadmin`, dan `/superadmin` **selalu** 404.

**Catatan data:** per 28 Nov 2026 database demo masih kosong untuk data
operasional (`kapal`, `jadwal`, `master_rute`, `kursi` = 0 baris), jadi hasil
pencarian tiket belum ada. Isi dulu data contoh sebelum demo dibagikan ke calon
pengguna.

### D. Menjalankan `security-tahap4-rls.sql` atau tidak

1. Baca `supabase/security-tahap4-rls.sql`. Isinya mengetatkan policy baca katalog
   (kapal, jadwal, kursi, template, rute, pengaturan) yang sekarang masih
   `using (true)` untuk `authenticated`, dan membatasi tulis `kursi_pakai` hanya
   untuk kapal milik penyewa sendiri.
2. Aturan yang dipakai sekarang: **demo harus sama dengan real**. Karena real
   belum menjalankannya, demo juga belum.
3. Kalau mau dipasang: jalankan dulu di **real**, uji aplikasi real (jual tiket,
   cetak, laporan, hapus penyewa), baru kemudian di demo. Jangan dibalik.
4. Cara paling aman: minta Cline menjalankannya lewat tool `apply_migration`
   (demo) lalu SQL Editor (real), kemudian bandingkan ulang dengan skrip parity.

## Verifikasi wajib

Jalankan di mesin yang punya env demo:

```bash
node scripts/verify-demo-clean.mjs
```

Script akan gagal kalau ada kapal/jadwal/kursi/pesanan/pembayaran/audit/refund
atau akun Superadmin di demo di luar `superadmin@lintasair.com` (akun khusus demo).
Storage bucket juga diperiksa; bucket boleh ada, tetapi harus kosong.

## Temuan di REAL yang butuh keputusan pemilik

1. **`penyewa_dihapus` dulu tidak ada di REAL.** Akibatnya menu Hapus Total
   Penyewa di Superadmin selalu gagal (route mengembalikan 503 "Fungsi
   hapus_penyewa_total belum ada"). Sudah diperbaiki 27 Nov 2026: tabel + fungsi
   dipasang di REAL dan DEMO, plus `supabase/hapus-penyewa.sql` diperbarui.
2. **2 baris `pengaturan_sistem` yatim di REAL** (`operator_id` menunjuk profil
   yang sudah tidak ada). Baris ini tidak dihapus otomatis karena itu data
   produksi. Lihat dan putuskan dulu:

   ```sql
   select ps.id, ps.operator_id, ps.updated_at
   from public.pengaturan_sistem ps
   where ps.operator_id is not null
     and not exists (select 1 from public.profiles p where p.id = ps.operator_id);
   ```

   Kalau memang sisa penyewa yang sudah dihapus, baru jalankan:

   ```sql
   delete from public.pengaturan_sistem ps
   where ps.operator_id is not null
     and not exists (select 1 from public.profiles p where p.id = ps.operator_id);
   ```
3. **Token akses Supabase (PAT) yang sempat tertulis di chat wajib diganti**
   (langkahnya di bagian B).

## Konsekuensi desain

- Satu filter tenant yang lupa dipasang tidak bisa membocorkan data real ke
  demo (dan sebaliknya), karena database-nya berbeda.
- Backup, auth, storage, dan laporan fee demo terisolasi.
- Etalase publik demo tetap memakai kode yang sama; karena database demo kosong,
  tidak ada kapal/jadwal real yang tampil.
