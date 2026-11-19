-- Backup Master Rute: Sungai Nyamuk / SNK
-- Jalankan hanya kalau baris ini belum ada.
insert into public.master_kota (nama_kota, singkatan)
select 'Sungai Nyamuk', 'SNK'
where not exists (
  select 1 from public.master_kota where nama_kota = 'Sungai Nyamuk'
);
