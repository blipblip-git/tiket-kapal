-- supabase/security-rpc-petugas.sql
-- Menutup eskalasi hak akses lewat RPC yang tidak dipakai aplikasi.
--
-- MASALAH (ditemukan 27 Nov 2026 dari Supabase Security Advisor):
--   public.buat_akun_petugas(...) adalah SECURITY DEFINER dan masih bisa
--   dipanggil oleh role `anon` (pengunjung tanpa login). Isinya TIDAK punya
--   pemeriksaan peran sama sekali: langsung INSERT ke auth.users + profiles
--   dengan p_role apa pun (termasuk 'admin_utama') dan menyimpan password
--   dalam bentuk teks (profiles.password_plain).
--
--   Artinya siapa pun yang tahu URL project + anon key (keduanya memang publik,
--   ikut terkirim ke browser) bisa membuat akun admin sendiri lewat:
--     POST /rest/v1/rpc/buat_akun_petugas
--
--   Aplikasi tidak memakai fungsi ini lagi (tidak ada pemanggilan di app/,
--   lib/, components/), jadi cukup dicabut. Pembuatan akun sekarang lewat route
--   server /api/superadmin/tambah-penyewa yang memakai service role.
--
-- Jalankan di SETIAP project (demo dan real), lalu cek ulang Security Advisor.

revoke all on function public.buat_akun_petugas(text, text, text, text, text)
  from anon, authenticated, public;

-- Kalau sudah dipastikan tidak ada kebutuhan lain, hapus saja fungsinya:
-- drop function if exists public.buat_akun_petugas(text, text, text, text, text);

-- Verifikasi: harus `false` untuk anon dan tidak ada baris hasil.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_bisa,
       has_function_privilege('authenticated', p.oid, 'execute')  as login_bisa
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'buat_akun_petugas';
