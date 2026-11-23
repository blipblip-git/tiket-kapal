-- =====================================================================
-- E-TIKET PUBLIK + BALITA
-- Tujuan:
--   1. /etiket (pembeli online) dan /cek-tiket bisa tahu mana baris balita
--      dan siapa induknya, supaya boarding pass balita menempel ke tiket
--      orang tuanya (tidak tercetak sebagai tiket terpisah).
--   2. RPC publik_pesanan_ids ikut mengembalikan baris balita yang
--      induk_id-nya ada di daftar ID yang diminta.
--
-- Aman dijalankan berulang. Jalankan di Supabase SQL Editor SETELAH
-- security-tahap3-publik.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RPC untuk /pembayaran & /etiket (berdasarkan ID yang diketahui)
-- ---------------------------------------------------------------------
drop function if exists public.publik_pesanan_ids(uuid[]);
create or replace function public.publik_pesanan_ids(p_ids uuid[])
returns table (
  id uuid,
  nama_penumpang text,
  kode_tiket text,
  status text,
  jadwal_id uuid,
  kursi_id uuid,
  is_balita boolean,
  induk_id uuid,
  grup_transaksi_id uuid,
  kanal text
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.nama_penumpang, p.kode_tiket, p.status,
    p.jadwal_id, p.kursi_id, p.is_balita,
    p.induk_id, p.grup_transaksi_id, p.kanal
  from public.pesanan p
  where (
      p.id = any(coalesce(p_ids, array[]::uuid[]))
      or p.induk_id = any(coalesce(p_ids, array[]::uuid[]))
      -- Data lama yang induk_id-nya kosong: ikutkan balita dalam grup yang sama.
      or (
        p.is_balita
        and p.grup_transaksi_id is not null
        and p.grup_transaksi_id in (
          select p2.grup_transaksi_id
          from public.pesanan p2
          where p2.id = any(coalesce(p_ids, array[]::uuid[]))
            and p2.grup_transaksi_id is not null
        )
      )
    )
    and (p.status = 'paid' or p.waktu_pesan > now() - interval '15 minutes')
  order by coalesce(p.induk_id, p.id), p.is_balita
  limit 50
$$;

-- ---------------------------------------------------------------------
-- 2. RPC untuk /cek-tiket (berdasarkan nomor HP)
-- ---------------------------------------------------------------------
drop function if exists public.publik_tiket_hp(text);
create or replace function public.publik_tiket_hp(p_hp text)
returns table (
  id uuid,
  nama_penumpang text,
  kode_tiket text,
  status text,
  waktu_pesan timestamptz,
  grup_transaksi_id uuid,
  jadwal_id uuid,
  is_balita boolean,
  induk_id uuid,
  rute_asal text,
  rute_tujuan text,
  tanggal text,
  jam_berangkat text
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.nama_penumpang, p.kode_tiket, p.status, p.waktu_pesan,
    p.grup_transaksi_id, p.jadwal_id, p.is_balita, p.induk_id,
    j.rute_asal::text, j.rute_tujuan::text, j.tanggal::text, j.jam_berangkat::text
  from public.pesanan p
  left join public.jadwal j on j.id = p.jadwal_id
  where regexp_replace(coalesce(p_hp, ''), '\D', '', 'g') <> ''
    and regexp_replace(coalesce(p.nomor_hp, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_hp, ''), '\D', '', 'g')
    and (
      p.status = 'paid'
      or (p.status = 'pending' and p.waktu_pesan > now() - interval '10 minutes')
    )
  order by p.waktu_pesan desc
  limit 50
$$;

revoke all on function public.publik_pesanan_ids(uuid[]) from public;
revoke all on function public.publik_tiket_hp(text) from public;
grant execute on function public.publik_pesanan_ids(uuid[]) to anon, authenticated;
grant execute on function public.publik_tiket_hp(text) to anon, authenticated;

notify pgrst, 'reload schema';
