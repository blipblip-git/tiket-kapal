-- Tambah Master Rute (Daerah): Sembakung (SMG)
-- operator_id NULL = berlaku untuk semua penyewa (global).
-- Idempotent: aman dijalankan berulang.
insert into public.master_kota (nama_kota, singkatan)
select 'Sembakung', 'SMG'
where not exists (
  select 1 from public.master_kota where lower(nama_kota) = 'sembakung'
);
