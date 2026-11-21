-- Tambah Master Rute (Daerah): Tanjung Batu (TJB)
-- Tabel master_kota = sumber dropdown rute asal/tujuan (Master Rute / Kamus Kota).
-- Idempotent: aman dijalankan berulang, tidak dobel kalau sudah ada.
insert into public.master_kota (nama_kota, singkatan)
select 'Tanjung Batu', 'TJB'
where not exists (
  select 1 from public.master_kota where lower(trim(nama_kota)) = 'tanjung batu'
);
