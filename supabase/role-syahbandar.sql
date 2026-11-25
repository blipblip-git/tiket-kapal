-- =====================================================================
-- IZINKAN ROLE "syahbandar" — TIKET KAPAL
-- Jalankan SEKALI di Supabase SQL Editor SEBELUM membuat akun syahbandar
-- (Supabase > SQL Editor > New query > paste semua isi berkas ini > RUN).
--
-- Kenapa perlu: tabel profiles punya check constraint `profiles_role_check`
-- yang hanya menerima role lama. Tanpa SQL ini, pembuatan akun syahbandar
-- gagal dengan pesan: "new row for relation profiles violates check
-- constraint profiles_role_check".
--
-- Catatan: semua role yang dipakai aplikasi tetap didaftarkan supaya
-- constraint lama tidak menolak role lain. Aman dijalankan berulang.
-- =====================================================================

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
    'kolektor',
    'syahbandar'
  ));

-- Cek hasil: harus ada baris dengan role = syahbandar di daftar constraint.
select conname, pg_get_constraintdef(oid) as isi_constraint
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';
