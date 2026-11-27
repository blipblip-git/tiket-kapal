-- supabase/security-search-path.sql
-- Menutup lint "function_search_path_mutable" Supabase Security Advisor.
--
-- Kenapa: fungsi yang search_path-nya bisa diubah pemanggil rawan "search_path
-- hijacking" — penyerang membuat objek di skema lain sehingga fungsi (apalagi
-- SECURITY DEFINER) memakai objek miliknya, bukan milik public.
--
-- Versi di bawah mencari fungsi berdasarkan NAMA, jadi aman dijalankan di demo
-- maupun real meskipun signature/argumennya sedikit berbeda.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'normalisasi_nomor_hp',
        'normalisasi_nomor_hp_profil',
        'buat_akun_petugas',
        'release_expired_holds'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    raise notice 'search_path diperbaiki: %', r.sig;
  end loop;
end $$;

-- Verifikasi: semua harus menampilkan config search_path.
select p.oid::regprocedure::text as fungsi,
       coalesce(array_to_string(p.proconfig, ', '), '(belum diset)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'normalisasi_nomor_hp',
    'normalisasi_nomor_hp_profil',
    'buat_akun_petugas',
    'release_expired_holds'
  )
order by 1;
