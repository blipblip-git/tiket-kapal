-- ============================================================
-- MIGRASI LAPORAN FEE (fee agen + fee platform)
-- Jalankan sekali di Supabase -> SQL Editor. Aman dijalankan berulang.
-- ============================================================

-- 1) Fee agen per tiket (Rupiah). Diisi Admin Utama di menu Manajemen Agen.
alter table public.profiles add column if not exists fee bigint not null default 0;

-- 2) Snapshot fee di setiap tiket (dibekukan saat transaksi).
--    fee_agen = fee penjual saat itu, fee_platform = fee platform saat itu.
alter table public.pesanan add column if not exists fee_agen bigint not null default 0;
alter table public.pesanan add column if not exists fee_platform bigint not null default 0;

-- 3) Fee platform global (hanya 1 baris dipakai; baris terbaru yang menang).
create table if not exists public.pengaturan_platform (
  id uuid primary key default gen_random_uuid(),
  fee_platform bigint not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 4) Izin akses (aplikasi memakai anon key dari browser + sesi login khusus).
grant select, insert, update on public.pengaturan_platform to anon, authenticated;
grant select, insert, update on public.pengaturan_platform to service_role;

-- 5) Baris awal fee platform (0 = belum diatur).
insert into public.pengaturan_platform (fee_platform, updated_by)
select 0, 'migrasi'
where not exists (select 1 from public.pengaturan_platform);

-- 6) Isi snapshot fee agen untuk tiket lama yang sudah dibayar.
--    Fee platform sengaja TIDAK diisi untuk data lama: aplikasi memakai nilai
--    fee yang berlaku sekarang saat snapshot-nya masih 0.
update public.pesanan p
set fee_agen = coalesce(a.fee, 0)
from public.profiles a
where p.is_balita = false
  and p.status = 'paid'
  and p.kanal = 'agen'
  and p.fee_agen = 0
  and a.role = 'agen'
  and (
    lower(coalesce(p.petugas_jual, '')) = lower(coalesce(a.email, ''))
    or regexp_replace(coalesce(p.petugas_jual, ''), '\D', '', 'g')
       = regexp_replace(coalesce(a.nomor_hp, ''), '\D', '', 'g')
  );
