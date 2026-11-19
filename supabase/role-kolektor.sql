-- Izinkan role "kolektor" pada tabel profiles.
-- Jalankan sekali di SQL Editor Supabase sebelum menambah akun kolektor.
-- Catatan: semua role yang dipakai aplikasi tetap didaftarkan supaya check
-- constraint lama tidak menolak role lain.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'admin_utama',
    'superadmin',
    'agen',
    'terminal_keberangkatan',
    'petugas_loket',
    'petugas_mobile',
    'kolektor'
  ));
