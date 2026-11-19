-- Isi operator_id audit_log yang NULL memakai relasi tabel yang ada.
-- Tanpa hardcode UUID / nomor HP. Aman diulang (idempotent).

-- 1. Relasi KURSI -> JADWAL
update public.audit_log a
set operator_id = j.operator_id
from public.kursi k
join public.jadwal j on j.id = k.jadwal_id
where a.operator_id is null
  and jsonb_typeof(a.detail -> 'daftar_penumpang') = 'array'
  and (a.detail -> 'daftar_penumpang' -> 0 ->> 'kursi_id') is not null
  and k.id::text = (a.detail -> 'daftar_penumpang' -> 0 ->> 'kursi_id')
  and j.operator_id is not null;

-- 2. Relasi PESANAN -> JADWAL lewat detail.grup_transaksi_id
update public.audit_log a
set operator_id = j.operator_id
from public.pesanan p
join public.jadwal j on j.id = p.jadwal_id
where a.operator_id is null
  and (a.detail ->> 'grup_transaksi_id') is not null
  and p.grup_transaksi_id::text = (a.detail ->> 'grup_transaksi_id')
  and j.operator_id is not null;

-- 3. Relasi PESANAN -> JADWAL lewat detail.daftar_penumpang[0].kode_tiket
update public.audit_log a
set operator_id = j.operator_id
from public.pesanan p
join public.jadwal j on j.id = p.jadwal_id
where a.operator_id is null
  and jsonb_typeof(a.detail -> 'daftar_penumpang') = 'array'
  and (a.detail -> 'daftar_penumpang' -> 0 ->> 'kode_tiket') is not null
  and p.kode_tiket = (a.detail -> 'daftar_penumpang' -> 0 ->> 'kode_tiket')
  and j.operator_id is not null;

-- 4. Relasi PETUGAS -> PROFILES
update public.audit_log a
set operator_id = coalesce(p.operator_id, p.id)
from public.profiles p
where a.operator_id is null
  and a.petugas_id = p.id;

-- 5. Cek sisa yang masih NULL
select count(*) as audit_tanpa_operator
from public.audit_log
where operator_id is null;
