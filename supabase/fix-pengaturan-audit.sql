-- ============================================================
-- FIX: Pengaturan Sistem & Audit Log
-- Jalankan SEKALI di Supabase Dashboard -> SQL Editor -> Run.
-- Aman diulang (idempotent): pakai IF NOT EXISTS.
--
-- Masalah yang diperbaiki:
-- 1. Tabel pengaturan_sistem tidak punya GRANT untuk anon/authenticated,
--    jadi halaman /pengaturan selalu gagal baca & gagal simpan
--    ("permission denied for table pengaturan_sistem").
-- 2. audit_log sudah 210 baris tapi operator_id semuanya NULL, sehingga
--    halaman /audit (filter per operator) selalu kosong.
-- 3. Audit lama yang dibuat akun login via nomor HP punya petugas_email
--    "unknown" karena kolom email NULL.
-- ============================================================

-- ---------- 1. PENGATURAN SISTEM ----------
alter table public.pengaturan_sistem add column if not exists operator_id uuid;
alter table public.pengaturan_sistem add column if not exists jam_mulai_kerja time not null default '06:00';
alter table public.pengaturan_sistem add column if not exists jam_selesai_kerja time not null default '17:00';
alter table public.pengaturan_sistem add column if not exists auto_logout_aktif boolean not null default true;
alter table public.pengaturan_sistem add column if not exists updated_by text;
alter table public.pengaturan_sistem add column if not exists updated_at timestamptz not null default now();

alter table public.pengaturan_sistem disable row level security;
grant select, insert, update on table public.pengaturan_sistem to anon, authenticated;

create index if not exists idx_pengaturan_sistem_operator
  on public.pengaturan_sistem (operator_id);

-- ---------- 2. AUDIT LOG ----------
alter table public.audit_log add column if not exists operator_id uuid;

alter table public.audit_log disable row level security;
grant select, insert on table public.audit_log to anon, authenticated;

create index if not exists idx_audit_log_operator_waktu
  on public.audit_log (operator_id, waktu desc);

-- Backfill operator_id audit lama dari profil pembuat log.
-- Admin Utama tidak punya operator_id -> pakai id-nya sendiri sebagai operator.
update public.audit_log a
set operator_id = coalesce(p.operator_id, p.id)
from public.profiles p
where a.petugas_id = p.id
  and a.operator_id is null;

-- Backfill identitas petugas yang sebelumnya tercatat "unknown".
update public.audit_log a
set petugas_email = coalesce(nullif(p.email, ''), nullif(p.nomor_hp, ''), nullif(p.nama, ''), a.petugas_email)
from public.profiles p
where a.petugas_id = p.id
  and (a.petugas_email is null or a.petugas_email = '' or a.petugas_email = 'unknown');

-- Backfill lewat email admin (akun lama yang petugas_id-nya sudah dihapus).
update public.audit_log a
set operator_id = p.id
from public.profiles p
where a.operator_id is null
  and p.role = 'admin_utama'
  and p.email is not null
  and lower(a.petugas_email) = lower(p.email);

-- 2b. Log lama dari akun yang sudah DIHAPUS (petugas_id tidak ada di profiles).
-- Petakan lewat kursi penumpang -> jadwal.operator_id.
update public.audit_log a
set operator_id = j.operator_id
from public.kursi k
join public.jadwal j on j.id = k.jadwal_id
where a.operator_id is null
  and jsonb_typeof(a.detail -> 'daftar_penumpang') = 'array'
  and (a.detail -> 'daftar_penumpang' -> 0 ->> 'kursi_id') is not null
  and k.id::text = (a.detail -> 'daftar_penumpang' -> 0 ->> 'kursi_id')
  and j.operator_id is not null;

-- Sisanya lewat grup_transaksi_id -> pesanan.jadwal_id -> jadwal.operator_id.
update public.audit_log a
set operator_id = j.operator_id
from public.pesanan p
join public.jadwal j on j.id = p.jadwal_id
where a.operator_id is null
  and (a.detail ->> 'grup_transaksi_id') is not null
  and p.grup_transaksi_id::text = (a.detail ->> 'grup_transaksi_id')
  and j.operator_id is not null;

-- 2c. Log warisan PT ANDALAS yang masih memakai ID LAMA.
-- f6dcd5c8-... = operator_id Andalas sebelum akun dibuat ulang (sudah tidak ada di profiles).
update public.audit_log a
set operator_id = (
  select p.id from public.profiles p
  where p.role = 'admin_utama' and p.nomor_hp = '082338313098'
  limit 1
)
where a.operator_id = 'f6dcd5c8-356e-4b13-9ed5-82275509d7e5';

-- Backfill awal sempat memakai id PETUGAS sebagai operator_id (petugasnya belum
-- punya operator_id). Log budi / syahril / wawan / jhon -> operator Andalas.
update public.audit_log a
set operator_id = (
  select p.id from public.profiles p
  where p.role = 'admin_utama' and p.nomor_hp = '082338313098'
  limit 1
)
where a.operator_id in (
  'cba2e230-9726-406a-b5d5-0cf15a2dd54f',
  'efb09e2d-a012-4713-be1e-1b1e9eeb50a8',
  '1dbeb166-1716-4315-ac16-5306a5b0d448',
  '5b8db0ab-527d-44c2-8f9a-b310111615c8'
);

-- 2d. Log yatim (akun agen/petugas sudah dihapus, kursi & jadwal juga sudah dihapus).
-- Semuanya penjualan loket/agen PT Andalas: nomor HP pelanggan di detail = 082338313098
-- (HP admin Andalas, dipakai sebagai data pembeli saat uji coba) atau varian typo-nya,
-- dan email petugas 08122224444 / 08125557777 / 081268560678 / 081277778888 /
-- 081299998888 / admin@limex.com (email admin Andalas sebelum diganti).
update public.audit_log a
set operator_id = (
  select p.id from public.profiles p
  where p.role = 'admin_utama' and p.nomor_hp = '082338313098'
  limit 1
)
where a.operator_id is null
  and (
    a.detail ->> 'nomor_hp' like '082338313%'
    or a.detail ->> 'nomor_hp' like '082338331%'
    or a.petugas_email in (
      '08122224444@petugas.local',
      '08125557777@petugas.local',
      '081268560678@petugas.local',
      '081277778888@petugas.local',
      '081299998888@petugas.local',
      'admin@limex.com'
    )
  );

-- ---------- 3. CEK HASIL ----------
-- Harus 0 baris: audit log yang belum punya operator_id
select count(*) as audit_tanpa_operator from public.audit_log where operator_id is null;
