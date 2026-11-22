-- =====================================================================
-- KUNCI KURSI PER SEGMEN (TRANSIT)
-- Satu kursi fisik boleh dipakai beberapa penumpang selama POTONGAN
-- JALANNYA tidak beririsan. Contoh kapal 40 kursi, rute Tarakan→Tg Batu
-- →Berau:
--   - penumpang Tarakan→Tg Batu kunci [0,1)
--   - penumpang Tg Batu→Berau   kunci [1,2)  → boleh kursi yang sama
--   - penumpang Tarakan→Berau   kunci [0,2)  → bentrok dengan keduanya
-- Aman dijalankan berulang (idempotent).
-- =====================================================================

create extension if not exists btree_gist;

create table if not exists public.kursi_pakai (
  id uuid primary key default gen_random_uuid(),
  -- keberangkatan_key = kapal_id|tanggal|jam (mis. "uuid|2026-11-23|11:00")
  keberangkatan_key text not null,
  nomor_kursi text not null,
  segmen_dari integer not null default 0,
  segmen_sampai integer not null default 900,
  pesanan_id uuid,
  kanal text,
  status text not null default 'aktif',
  created_at timestamptz not null default now(),
  constraint kursi_pakai_segmen_wajar check (segmen_dari < segmen_sampai)
);

create index if not exists idx_kursi_pakai_key on public.kursi_pakai (keberangkatan_key, nomor_kursi);
create index if not exists idx_kursi_pakai_pesanan on public.kursi_pakai (pesanan_id);

-- INTI JAMINAN: satu kursi pada satu keberangkatan tidak bisa dipakai dua
-- tiket pada interval yang beririsan. [0,1) vs [1,2) tetap boleh.
alter table public.kursi_pakai drop constraint if exists kursi_pakai_tanpa_bentrok;
alter table public.kursi_pakai add constraint kursi_pakai_tanpa_bentrok
  exclude using gist (
    keberangkatan_key with =,
    nomor_kursi with =,
    int4range(segmen_dari, segmen_sampai) with &&
  ) where (status = 'aktif');

-- Hak akses: anon hanya baca (peta kursi publik), staf login boleh tulis.
revoke all on public.kursi_pakai from anon;
grant select on public.kursi_pakai to anon;
grant select, insert, update, delete on public.kursi_pakai to authenticated;
grant select, insert, update, delete on public.kursi_pakai to service_role;

alter table public.kursi_pakai enable row level security;

drop policy if exists baca_publik_kursi_pakai on public.kursi_pakai;
create policy baca_publik_kursi_pakai on public.kursi_pakai
  for select to anon using (true);

drop policy if exists tulis_staf_kursi_pakai on public.kursi_pakai;
create policy tulis_staf_kursi_pakai on public.kursi_pakai
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- BACKFILL tiket lama (sebelum fitur ini ada).
-- Interval dibuat [0,900) = seluruh perjalanan (konservatif: tidak mungkin
-- oversold). Baris yang bentrok karena data lama sudah dobel dilewati.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select
      p.id as pesanan_id,
      p.kanal,
      ku.nomor_kursi,
      j.kapal_id::text || '|' || to_char(j.tanggal, 'YYYY-MM-DD') || '|' || left(j.jam_berangkat::text, 5) as keberangkatan_key
    from public.pesanan p
    join public.jadwal j on j.id = p.jadwal_id
    join public.kursi ku on ku.id = p.kursi_id
    where p.kursi_id is not null
      and coalesce(p.status, '') not in ('batal', 'refund', 'dibatalkan')
      and not exists (select 1 from public.kursi_pakai kp where kp.pesanan_id = p.id)
  loop
    begin
      insert into public.kursi_pakai
        (keberangkatan_key, nomor_kursi, segmen_dari, segmen_sampai, pesanan_id, kanal, status)
      values
        (r.keberangkatan_key, r.nomor_kursi, 0, 900, r.pesanan_id, r.kanal, 'aktif');
    exception when exclusion_violation then
      raise notice 'Dilewati (kursi % sudah dobel): pesanan %', r.nomor_kursi, r.pesanan_id;
    end;
  end loop;
end $$;

-- Cek hasil
select count(*) as total_kunci_kursi,
       count(distinct keberangkatan_key) as total_keberangkatan
from public.kursi_pakai
where status = 'aktif';
