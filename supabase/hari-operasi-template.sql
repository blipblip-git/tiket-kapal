-- ============================================================
-- HARI OPERASI KAPAL (template_jadwal)
-- Kapal yang tidak jalan tiap hari, contoh hanya SENIN, RABU, JUMAT.
-- Jalankan SEKALI di Supabase SQL Editor sebelum pakai fitur ini.
-- ============================================================

-- 1) Kolom hari operasi. NULL / array kosong = beroperasi SETIAP HARI.
alter table public.template_jadwal
  add column if not exists hari_operasi text[] not null
  default array['senin','selasa','rabu','kamis','jumat','sabtu','minggu'];

-- 2) Rapikan data lama yang NULL / kosong → semua hari (biar tidak berubah perilaku).
update public.template_jadwal
set hari_operasi = array['senin','selasa','rabu','kamis','jumat','sabtu','minggu']
where hari_operasi is null or cardinality(hari_operasi) = 0;

-- 3) Pengaman: isi hanya boleh nama hari huruf kecil.
alter table public.template_jadwal drop constraint if exists template_jadwal_hari_operasi_valid;
alter table public.template_jadwal add constraint template_jadwal_hari_operasi_valid
  check (hari_operasi <@ array['senin','selasa','rabu','kamis','jumat','sabtu','minggu']);

-- 4) Contoh: set kapal tertentu jadi Senin/Rabu/Jumat.
--    Ganti <TEMPLATE_ID> dengan id template yang mau diatur.
-- update public.template_jadwal
-- set hari_operasi = array['senin','rabu','jumat']
-- where id = '<TEMPLATE_ID>';

-- 5) OPSIONAL: matikan jadwal (hari ini & ke depan) yang sudah terlanjur
--    ter-generate di hari yang bukan hari operasi. Hati-hati: cek dulu
--    apakah ada tiket terjual sebelum menjalankan.
-- update public.jadwal j
-- set status = 'nonaktif'
-- from public.template_jadwal t
-- where j.kapal_id = t.kapal_id
--   and j.rute_asal = t.rute_asal
--   and j.rute_tujuan = t.rute_tujuan
--   and j.jam_berangkat = t.jam_berangkat
--   and j.tanggal >= current_date
--   and not (case extract(dow from j.tanggal)
--              when 0 then 'minggu' when 1 then 'senin' when 2 then 'selasa'
--              when 3 then 'rabu' when 4 then 'kamis' when 5 then 'jumat'
--              else 'sabtu' end = any(t.hari_operasi));
