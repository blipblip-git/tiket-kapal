-- ============================================================
-- SATU NOMOR HP = SATU AKUN LOGIN
-- Jalankan sekali di SQL Editor Supabase.
-- Aman dijalankan berulang (idempotent).
--
-- Aplikasi sudah memeriksa nomor HP lewat /api/admin/validasi-nomor-hp,
-- tetapi index unik ini adalah pengaman terakhir kalau ada insert/update
-- yang tidak lewat form (mis. akses langsung ke database).
-- ============================================================

-- Bentuk baku: 08xxxxxxxxxx (62/+62/spasi/tanda hubung dirapikan).
create or replace function public.normalisasi_nomor_hp(p_nomor text)
returns text
language sql
immutable
as $$
  select case
    when digit = '' then ''
    when digit like '620%' then '0' || substr(digit, 4)
    when digit like '62%' then '0' || substr(digit, 3)
    when digit like '8%' then '0' || digit
    else digit
  end
  from (
    select regexp_replace(coalesce(p_nomor, ''), '\D', '', 'g') as digit
  ) d;
$$;

-- Semua penulisan ke profiles otomatis disimpan dalam bentuk baku.
create or replace function public.normalisasi_nomor_hp_profil()
returns trigger
language plpgsql
as $$
begin
  new.nomor_hp := nullif(public.normalisasi_nomor_hp(new.nomor_hp), '');
  return new;
end;
$$;

drop trigger if exists trg_normalisasi_nomor_hp on public.profiles;
create trigger trg_normalisasi_nomor_hp
before insert or update of nomor_hp on public.profiles
for each row execute function public.normalisasi_nomor_hp_profil();

-- Cek dulu kalau masih ada nomor ganda pada data lama:
-- select public.normalisasi_nomor_hp(nomor_hp) as nomor,
--        count(*), array_agg(nama)
-- from public.profiles
-- where public.normalisasi_nomor_hp(nomor_hp) <> ''
-- group by 1 having count(*) > 1;
--
-- Kalau hasilnya kosong, index di bawah bisa dibuat.
create unique index if not exists profiles_nomor_hp_unik
  on public.profiles (public.normalisasi_nomor_hp(nomor_hp))
  where public.normalisasi_nomor_hp(nomor_hp) <> '';

-- Supaya PostgREST langsung mengenali fungsi/trigger baru.
notify pgrst, 'reload schema';
