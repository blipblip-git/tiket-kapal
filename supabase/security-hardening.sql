-- ============================================================
-- TIKET KAPAL — HARDENING KEAMANAN (TAHAP 1)
-- Jalankan di Supabase Dashboard -> SQL Editor (role postgres).
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- 1) Kolom hash password (kode baru menyimpan PBKDF2, bukan plaintext)
alter table public.profiles add column if not exists password_hash text;

-- 2) Index supaya login (email / nomor HP) cepat
create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_nomor_hp_idx on public.profiles (nomor_hp);

-- 3) Cek akun lama yang password-nya masih plaintext.
--    Login pertama akun tersebut otomatis memigrasikan plaintext -> hash.
-- select count(*) as masih_plaintext
-- from public.profiles
-- where password_hash is null and password_plain is not null;

-- 4) Setelah hasil query (3) = 0 (semua akun sudah pernah login),
--    hapus kolom plaintext. JANGAN dijalankan sebelum kode baru live.
-- alter table public.profiles drop column password_plain;


-- ============================================================
-- TAHAP 2 (BELUM DIJALANKAN — butuh migrasi sesi petugas)
-- ============================================================
-- Selama petugas/agen masih memakai localStorage + anon key untuk baca/tulis
-- langsung ke Supabase, RLS TIDAK BISA diaktifkan tanpa mematikan aplikasi.
-- Rencana:
--   1. Semua baca/tulis data lewat API route (service role) atau Supabase Auth.
--   2. Ganti semua select('*') profiles jadi kolom eksplisit.
--   3. Baru jalankan:
--      revoke all on public.profiles from anon;
--      revoke all on public.pesanan from anon;
--      revoke all on public.kursi from anon;
--      revoke all on public.pembayaran from anon;
--      revoke all on public.refund from anon;
--      revoke all on public.audit_log from anon;
--      alter table public.profiles enable row level security;
--      ... (policy per operator_id / auth.uid()) ...
