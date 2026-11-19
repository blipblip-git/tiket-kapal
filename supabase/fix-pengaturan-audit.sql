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

-- ---------- 3. CEK HASIL ----------
-- Harus 0 baris: audit log yang belum punya operator_id
select count(*) as audit_tanpa_operator from public.audit_log where operator_id is null;
