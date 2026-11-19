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

## Belum selesai (tahap 2 — risiko tersisa)

Selama aplikasi masih memakai anon key dari browser untuk baca/tulis langsung:

- RLS masih **nonaktif**; anon key bisa membaca/menghapus data tabel operasional
  (`pesanan`, `kursi`, `pembayaran`, `refund`, `audit_log`, `profiles`).
- Sesi petugas/agen masih di `localStorage` dan belum diverifikasi server di setiap request,
  jadi role bisa dipalsukan di UI (API superadmin sudah aman karena dicek ulang di server).
- `/superadmin/daftar` masih terbuka untuk pendaftaran publik — sebaiknya dinonaktifkan
  atau diberi kode undangan server-side.
- `/daftar-admin` & `/registrasi-admin` masih pendaftaran mandiri tenant.

Langkah tahap 2:

1. Pindahkan seluruh baca/tulis data ke API route (service role) **atau** login semua petugas
   dengan Supabase Auth.
2. Ganti semua `select('*')` pada `profiles` menjadi kolom eksplisit.
3. Aktifkan RLS + `REVOKE` hak anon, dengan policy per `operator_id` / `auth.uid()`.
4. Uji alur: jual tiket online, scan etiket, manifest syahbandar, laporan tenant, superadmin.
