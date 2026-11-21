-- =====================================================================
-- PENGAMANAN TAHAP 3 — TIKET KAPAL
-- Tujuan:
--   1. Anon TIDAK BISA lagi membaca SEMUA pesanan lunas semua tenant
--      (dulu policy: status = 'paid'). Sekarang hanya bisa:
--        - pesanan milik ID yang dia tahu (halaman pembayaran, < 15 menit / lunas)
--        - tiket milik nomor HP yang dia masukkan (halaman cek tiket)
--   2. Anon TIDAK BISA membaca tabel pembayaran sama sekali.
--   3. API key per-tenant (api_klien) untuk penjualan online lewat sistem tenant.
-- Idempotent — aman dijalankan berulang. Jalankan di Supabase SQL Editor.
-- =====================================================================

-- Bikin kunci acak & hash tanpa bergantung pada pgcrypto
-- (gen_random_uuid & sha256 sudah tersedia di PostgreSQL 13+ / Supabase).

-- ---------------------------------------------------------------------
-- 1. RPC PUBLIK (SECURITY DEFINER = melewati RLS, tapi hasilnya dibatasi)
-- ---------------------------------------------------------------------

-- Halaman /pembayaran & /pembayaran/cash: hanya pesanan yang ID-nya sudah
-- diketahui pengunjung, dan hanya kalau lunas atau masih dalam 15 menit.
drop function if exists public.publik_pesanan_ids(uuid[]);
create or replace function public.publik_pesanan_ids(p_ids uuid[])
returns table (
  id uuid,
  nama_penumpang text,
  kode_tiket text,
  status text,
  jadwal_id uuid,
  kursi_id uuid,
  is_balita boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nama_penumpang, p.kode_tiket, p.status, p.jadwal_id, p.kursi_id, p.is_balita
  from public.pesanan p
  where p.id = any(coalesce(p_ids, array[]::uuid[]))
    and (p.status = 'paid' or p.waktu_pesan > now() - interval '15 minutes')
  limit 20
$$;

-- Halaman /cek-tiket: cari tiket berdasarkan nomor HP (bukan daftar semua).
-- NIK & nomor HP tidak dikembalikan.
drop function if exists public.publik_tiket_hp(text);
create or replace function public.publik_tiket_hp(p_hp text)
returns table (
  id uuid,
  nama_penumpang text,
  kode_tiket text,
  status text,
  waktu_pesan timestamptz,
  grup_transaksi_id uuid,
  jadwal_id uuid,
  rute_asal text,
  rute_tujuan text,
  tanggal text,
  jam_berangkat text
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.nama_penumpang, p.kode_tiket, p.status, p.waktu_pesan,
    p.grup_transaksi_id, p.jadwal_id,
    j.rute_asal::text, j.rute_tujuan::text, j.tanggal::text, j.jam_berangkat::text
  from public.pesanan p
  left join public.jadwal j on j.id = p.jadwal_id
  where regexp_replace(coalesce(p_hp, ''), '\D', '', 'g') <> ''
    and regexp_replace(coalesce(p.nomor_hp, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_hp, ''), '\D', '', 'g')
    and (
      p.status = 'paid'
      or (p.status = 'pending' and p.waktu_pesan > now() - interval '10 minutes')
    )
  order by p.waktu_pesan desc
  limit 50
$$;

revoke all on function public.publik_pesanan_ids(uuid[]) from public;
revoke all on function public.publik_tiket_hp(text) from public;
grant execute on function public.publik_pesanan_ids(uuid[]) to anon, authenticated;
grant execute on function public.publik_tiket_hp(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. TUTUP BACA BEBAS PESANAN & PEMBAYARAN UNTUK ANON
-- ---------------------------------------------------------------------
drop policy if exists baca_publik_pesanan on public.pesanan;
drop policy if exists baca_publik_pembayaran on public.pembayaran;

revoke select on public.pesanan from anon;
revoke select on public.pembayaran from anon;

-- Staf yang login tetap bisa membaca (RLS per penyewa dari tahap 2).
grant select on public.pesanan to authenticated;
grant select on public.pembayaran to authenticated;

-- ---------------------------------------------------------------------
-- 3. API KEY PER TENANT (integrasi penjualan online milik tenant)
-- ---------------------------------------------------------------------
create table if not exists public.api_klien (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  label text not null default 'Integrasi',
  kunci_hash text not null unique,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  dicabut_at timestamptz,
  last_used_at timestamptz
);

create index if not exists idx_api_klien_operator on public.api_klien(operator_id);

alter table public.api_klien enable row level security;
revoke all on public.api_klien from anon;
revoke all on public.api_klien from authenticated;
grant select, insert, update, delete on public.api_klien to service_role;
-- Tidak ada policy = anon/authenticated tidak bisa melihat kunci sama sekali.

-- Buat kunci baru. Kunci asli HANYA muncul sekali di hasil fungsi ini.
-- Contoh: select public.fn_buat_api_key('<uuid admin_utama>', 'Website PT ABC');
create or replace function public.fn_buat_api_key(p_operator uuid, p_label text default 'Integrasi')
returns text
language plpgsql security definer set search_path = public as $$
declare
  kunci text;
begin
  if not public.fn_istimewa() then
    raise exception 'Hanya Superadmin yang boleh membuat API key.';
  end if;
  if p_operator is null then
    raise exception 'operator_id wajib diisi.';
  end if;

  kunci := 'la_live_' || replace(gen_random_uuid()::text, '-', '')
                        || replace(gen_random_uuid()::text, '-', '');

  insert into public.api_klien (operator_id, label, kunci_hash)
  values (p_operator, coalesce(nullif(btrim(p_label), ''), 'Integrasi'),
          encode(sha256(convert_to(kunci, 'UTF8')), 'hex'));

  return kunci;
end $$;

-- Cabut kunci (tidak dihapus supaya jejaknya masih ada).
create or replace function public.fn_cabut_api_key(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_istimewa() then
    raise exception 'Hanya Superadmin yang boleh mencabut API key.';
  end if;
  update public.api_klien set aktif = false, dicabut_at = now() where id = p_id;
  return found;
end $$;

-- Daftar kunci (tanpa hash) untuk superadmin.
create or replace function public.fn_daftar_api_key()
returns table (
  id uuid, operator_id uuid, label text, aktif boolean,
  created_at timestamptz, dicabut_at timestamptz, last_used_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.operator_id, a.label, a.aktif, a.created_at, a.dicabut_at, a.last_used_at
  from public.api_klien a
  where public.fn_istimewa()
  order by a.created_at desc
$$;

revoke all on function public.fn_buat_api_key(uuid, text) from public;
revoke all on function public.fn_cabut_api_key(uuid) from public;
revoke all on function public.fn_daftar_api_key() from public;
grant execute on function public.fn_buat_api_key(uuid, text) to service_role;
grant execute on function public.fn_cabut_api_key(uuid) to service_role;
grant execute on function public.fn_daftar_api_key() to service_role;

notify pgrst, 'reload schema';
