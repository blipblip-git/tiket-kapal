-- ============================================================
-- PONDASI PEMBAYARAN ONLINE (GATEWAY-NETRAL)
-- Jalankan sekali di Supabase -> SQL Editor. Aman dijalankan berulang.
--
-- Yang dibuat:
--   1. metode_bayar      -> daftar channel + biaya layanan yang dibebankan ke pembeli
--   2. tagihan           -> satu tagihan online (bisa berisi beberapa tiket)
--   3. tagihan_split     -> pembagian dana per tagihan (pemilik / platform / agen)
--   4. rekening_penerima -> rekening pemilik kapal + status verifikasi gateway
--
-- PENTING: tabel lama public.pembayaran (tunai/QRIS loket: pesanan_id, metode,
-- jumlah, referensi) TIDAK diubah. Tabel baru sengaja dinamai tagihan supaya
-- laporan kasir yang sudah jalan tidak rusak.
--
-- Catatan: kolom pg_* sengaja generik. Pindah gateway (iPaymu/Midtrans/Duitku)
-- TIDAK perlu ubah skema; data mentah gateway disimpan di pg_payload (jsonb).
-- ============================================================

-- ---------- 0) Penanda tarif biaya layanan aktif ----------
alter table public.pengaturan_platform
  add column if not exists biaya_layanan_aktif boolean not null default true;

-- ---------- 1) Daftar metode bayar + biaya layanan ----------
create table if not exists public.metode_bayar (
  kode            text primary key,
  nama            text not null,
  tipe            text not null default 'va',       -- qris | va | retail | ewallet | kartu | manual
  pg_provider     text,                             -- ipaymu | midtrans | duitku | manual
  biaya_tipe      text not null default 'flat',     -- flat | persen
  biaya_nilai     numeric(12,6) not null default 0, -- 3500 (flat) atau 0.007 (persen)
  biaya_min       bigint not null default 0,
  biaya_maks      bigint,                           -- null = tanpa batas
  settlement_hari int not null default 0,           -- H+0 / H+2 / H+3
  aktif           boolean not null default true,
  urutan          int not null default 0,
  catatan         text,
  updated_at      timestamptz not null default now()
);

-- Biaya gateway dipakai APA ADANYA sebagai biaya layanan yang dibebankan ke
-- pembeli (lihat rumus gross-up di docs/PAYMENT.md dan lib/payment/tarif.ts).
insert into public.metode_bayar
  (kode, nama, tipe, pg_provider, biaya_tipe, biaya_nilai, biaya_min, settlement_hari, aktif, urutan, catatan)
values
  ('qris', 'QRIS (settlement H+2)', 'qris', 'ipaymu', 'persen', 0.007, 0, 2, true, 1,
   'iPaymu: 0,7% untuk nominal > Rp100.000 (H+2). Nominal <= Rp100.000: 0,5%.'),
  ('qris_instan', 'QRIS instan (H+0)', 'qris', 'ipaymu', 'persen', 0.025, 0, 0, false, 2,
   'iPaymu H+0: 0,7% + 1,8%. Mahal, aktifkan hanya kalau perlu dana cepat.'),
  ('va_h2', 'Virtual Account (H+2)', 'va', 'ipaymu', 'flat', 4000, 0, 2, true, 3,
   'iPaymu VA H+2 Rp4.000 (sebagian bank Rp3.500). Sesuaikan dengan kontrak.'),
  ('va_h0', 'Virtual Account instan (H+0)', 'va', 'ipaymu', 'flat', 5000, 0, 0, false, 4,
   'iPaymu VA H+0 Rp5.000, ada diskon 30% untuk bank tertentu.'),
  ('retail', 'Alfamart / Indomaret', 'retail', 'ipaymu', 'flat', 5000, 0, 3, true, 5,
   'iPaymu publikasi Rp4.000 (H+3). Isi 5.000 = tarif yang kita tagihkan ke pembeli.'),
  ('ewallet', 'E-Wallet (OVO / DANA / ShopeePay)', 'ewallet', 'ipaymu', 'persen', 0.015, 0, 3, true, 6,
   'iPaymu publikasi 3,5% (H+3). Konfirmasi tarif kontrak sebelum go-live.'),
  ('transfer_manual', 'Transfer bank manual', 'manual', 'manual', 'flat', 0, 0, 0, true, 9,
   'Dipakai sebelum gateway aktif: pembeli transfer, petugas/admin verifikasi.')
on conflict (kode) do nothing;

-- ---------- 2) Tagihan pembayaran ----------
create table if not exists public.tagihan (
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid,                                  -- penyewa/pemilik yang dijual tiketnya
  kode_bayar    text not null unique,                  -- kode internal (juga dikirim ke gateway)
  pg_provider   text not null default 'manual',
  pg_mode       text not null default 'sandbox',       -- sandbox | production
  metode_kode   text references public.metode_bayar(kode),
  jumlah_tiket  int not null default 1,
  dasar         bigint not null default 0,             -- hak pemilik + fee platform (tanpa biaya layanan)
  biaya_layanan bigint not null default 0,             -- dibebankan ke pembeli (menutup MDR)
  total_tagih   bigint not null default 0,
  mdr_estimasi  bigint not null default 0,
  mdr_aktual    bigint,                                -- diisi dari settlement/webhook
  status        text not null default 'pending',       -- pending | paid | expired | gagal | refund
  pg_ref        text,
  pg_payload    jsonb,
  instruksi     text,                                  -- teks instruksi bayar (VA/QRIS/transfer)
  expired_at    timestamptz,
  paid_at       timestamptz,
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tagihan_operator on public.tagihan(operator_id);
create index if not exists idx_tagihan_status on public.tagihan(status, created_at desc);
create index if not exists idx_tagihan_pgref on public.tagihan(pg_provider, pg_ref);

-- ---------- 3) Pembagian dana (split gateway / disbursement / manual) ----------
create table if not exists public.tagihan_split (
  id              uuid primary key default gen_random_uuid(),
  tagihan_id   uuid not null references public.tagihan(id) on delete cascade,
  penerima_tipe   text not null,                    -- pemilik | platform | agen
  penerima_id     uuid,                             -- profiles.id pemilik/agen (null utk platform)
  nama_penerima   text,
  nominal         bigint not null default 0,
  status          text not null default 'menunggu', -- menunggu | ditahan | dikirim | selesai | gagal | dibatalkan
  metode_kirim    text,                             -- split_gateway | disbursement | transfer_manual
  rekening_id     uuid,                             -- -> rekening_penerima.id
  pg_ref          text,
  bukti_url       text,
  dikirim_at      timestamptz,
  selesai_at      timestamptz,
  catatan         text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_split_tagihan on public.tagihan_split(tagihan_id);
create index if not exists idx_split_penerima on public.tagihan_split(penerima_id, status);

-- ---------- 4) Rekening penerima (pemilik kapal / agen) ----------
create table if not exists public.rekening_penerima (
  id                uuid primary key default gen_random_uuid(),
  pemilik_id        uuid not null references public.profiles(id) on delete cascade,
  tipe              text not null default 'bank',   -- bank | ewallet
  bank_kode         text,                           -- bca | bni | bri | mandiri | bjb | dana | ovo
  nomor             text not null,
  nama_pemilik      text not null,                  -- harus sama dengan buku rekening
  pg_provider       text,
  pg_beneficiary_id text,                           -- ID sub-merchant/beneficiary di gateway
  status            text not null default 'draft',  -- draft | dokumen_lengkap | verifikasi | aktif | ditolak
  dokumen           jsonb,                          -- {ktp, npwp, nib, buku_rekening}
  catatan_verifikasi text,
  dibuat_oleh       uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (pemilik_id, bank_kode, nomor)
);

create index if not exists idx_rekening_pemilik on public.rekening_penerima(pemilik_id, status);

-- ---------- 5) Kolom bantu di pesanan ----------
alter table public.pesanan add column if not exists tagihan_id uuid;
alter table public.pesanan add column if not exists total_bayar bigint not null default 0;
alter table public.pesanan add column if not exists biaya_layanan bigint not null default 0;

create index if not exists idx_pesanan_pembayaran on public.pesanan(tagihan_id);

-- ---------- 6) RLS + hak akses ----------
alter table public.metode_bayar      enable row level security;
alter table public.tagihan        enable row level security;
alter table public.tagihan_split  enable row level security;
alter table public.rekening_penerima enable row level security;

-- metode_bayar: tarif boleh dibaca publik (dipakai halaman checkout).
drop policy if exists metode_bayar_baca on public.metode_bayar;
create policy metode_bayar_baca on public.metode_bayar for select using (true);

drop policy if exists metode_bayar_kelola on public.metode_bayar;
create policy metode_bayar_kelola on public.metode_bayar for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- pembayaran: dibaca admin penyewa + superadmin. Penulisan lewat server
-- (service role) atau superadmin.
drop policy if exists tagihan_baca on public.tagihan;
create policy tagihan_baca on public.tagihan for select
  using (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists tagihan_kelola on public.tagihan;
create policy tagihan_kelola on public.tagihan for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- tagihan_split: admin penyewa, penerima dana, dan superadmin.
drop policy if exists split_baca on public.tagihan_split;
create policy split_baca on public.tagihan_split for select
  using (
    public.is_superadmin()
    or penerima_id = public.my_profile_id()
    or exists (
      select 1 from public.tagihan p
      where p.id = tagihan_split.tagihan_id
        and p.operator_id = public.my_operator_id()
    )
  );

drop policy if exists split_kelola on public.tagihan_split;
create policy split_kelola on public.tagihan_split for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- rekening_penerima: pemilik melihat rekeningnya sendiri; verifikasi &
-- pg_beneficiary_id diisi server/superadmin.
drop policy if exists rekening_baca on public.rekening_penerima;
create policy rekening_baca on public.rekening_penerima for select
  using (public.is_superadmin() or pemilik_id = public.my_profile_id());

drop policy if exists rekening_kelola on public.rekening_penerima;
create policy rekening_kelola on public.rekening_penerima for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Grants (RLS di atas tetap menentukan baris mana yang boleh dibaca).
grant select on public.metode_bayar to anon, authenticated;
grant select, insert, update, delete on public.metode_bayar to authenticated;
grant select on public.tagihan to authenticated;
grant select on public.tagihan_split to authenticated;
grant select on public.rekening_penerima to authenticated;
grant all on public.metode_bayar, public.tagihan, public.tagihan_split, public.rekening_penerima
  to service_role;

