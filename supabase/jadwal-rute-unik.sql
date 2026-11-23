-- supabase/jadwal-rute-unik.sql
-- ============================================================
-- Satu kapal pada jam yang sama boleh melayani beberapa tujuan.
--
-- Contoh nyata: kapal yang sama berangkat 14:00 dari Tarakan menuju
-- Tanjung Batu dan juga menuju Berau (penumpang turun di potongan jalan
-- yang berbeda). Constraint lama:
--
--   unique (kapal_id, tanggal, jam_berangkat)
--
-- menolak baris kedua, sehingga rute kedua (dan rute-rute berikutnya)
-- tidak pernah muncul di Jual Tiket Petugas/Agen.
--
-- Kunci yang benar harus memuat rute:
--   kapal_id + tanggal + jam_berangkat + rute_asal + rute_tujuan
--
-- Aman dijalankan berulang kali (idempotent).
-- ============================================================

begin;

alter table public.jadwal
  drop constraint if exists unique_jadwal_kapal_tanggal_jam;

-- Kalau di database lama aturannya berupa unique index (bukan constraint),
-- index itu juga harus dilepas. Kalau sudah terlepas bersama constraint,
-- perintah ini hanya no-op.
drop index if exists public.unique_jadwal_kapal_tanggal_jam;

create unique index if not exists unique_jadwal_kapal_tanggal_jam_rute
  on public.jadwal (kapal_id, tanggal, jam_berangkat, rute_asal, rute_tujuan);

commit;
