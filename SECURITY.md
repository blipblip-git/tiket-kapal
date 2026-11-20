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
- Baca publik `pesanan` dibatasi: hanya tiket lunas + pesanan 15 menit terakhir.

**Setelah deploy + SQL:** semua staf harus **login ulang** sekali supaya sesi
Supabase Auth terpasang (tanpa itu mereka bisa masuk tapi tulis data ditolak).

Sisa risiko (perlu tahap 3):

1. Pembayaran online masih **simulasi** (belum payment gateway), jadi status `paid`
   bisa dibuat siapa pun yang menekan "Saya Sudah Bayar".
2. Tiket masih bisa dipakai ulang kalau staff sengaja membuat pesanan `paid` tanpa uang
   (internal tenant) — perlu rekonsiliasi kas / gateway.
3. Halaman publik masih membaca sebagian data operasional (nama penumpang) lewat
   anon `select` yang dibatasi baris; idealnya semua baca publik lewat API.

