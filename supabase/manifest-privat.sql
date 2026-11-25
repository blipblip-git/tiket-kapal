-- =====================================================================
-- MANIFEST SYAHBANDAR JADI PRIVAT — TIKET KAPAL
--
-- JALANKAN SQL INI PALING AKHIR, yaitu SETELAH:
--   1. supabase/role-syahbandar.sql sudah dijalankan,
--   2. kode baru (login syahbandar) sudah live di Vercel,
--   3. satu akun syahbandar sudah dibuat dan berhasil login + membuka
--      manifest di HP.
--
-- Kenapa: fungsi publik_manifest_jadwal() mengembalikan nama penumpang,
-- nomor kursi, dan status boarding. Sebelum ini fungsi tersebut boleh
-- dipanggil `anon` (siapa pun yang punya anon key), sehingga data penumpang
-- bisa dibaca tanpa login. Sekarang hanya akun login (authenticated) yang
-- boleh memanggilnya.
--
-- Aman dijalankan berulang.
-- =====================================================================

revoke all on function public.publik_manifest_jadwal(uuid[], int, int) from public;
revoke all on function public.publik_manifest_jadwal(uuid[], int, int) from anon;
grant execute on function public.publik_manifest_jadwal(uuid[], int, int) to authenticated;

-- Pastikan PostgREST memuat ulang daftar hak akses.
notify pgrst, 'reload schema';

-- Cek hasil: `anon` TIDAK boleh muncul, `authenticated` harus muncul.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'publik_manifest_jadwal'
order by grantee;
