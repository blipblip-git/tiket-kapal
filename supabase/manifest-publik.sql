-- =====================================================================
-- MANIFEST PUBLIK (PORTAL SYAHBANDAR) — TIKET KAPAL
-- Masalah: security-tahap3-publik.sql mencabut `select` tabel pesanan dari
-- anon (permission denied for table pesanan), sehingga manifest Syahbandar
-- selalu kosong walau jadwalnya ada.
--
-- Solusi: satu RPC SECURITY DEFINER yang HANYA mengembalikan kolom manifest
-- (nama, kursi, status boarding, balita) untuk jadwal yang diminta — tanpa
-- NIK, nomor HP, kode tiket, atau data pembayaran.
-- Idempotent — aman dijalankan berulang di Supabase SQL Editor.
-- =====================================================================

drop function if exists public.publik_manifest_jadwal(uuid[], int, int);

create or replace function public.publik_manifest_jadwal(
  p_jadwal_ids uuid[],
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  nama_penumpang text,
  status_boarding text,
  waktu_boarding timestamptz,
  is_balita boolean,
  grup_transaksi_id uuid,
  jadwal_id uuid,
  nomor_kursi text
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.nama_penumpang,
    p.status_boarding,
    p.waktu_boarding,
    p.is_balita,
    p.grup_transaksi_id,
    p.jadwal_id,
    k.nomor_kursi
  from public.pesanan p
  left join public.kursi k on k.id = p.kursi_id
  where p.jadwal_id = any(coalesce(p_jadwal_ids, array[]::uuid[]))
    and p.status = 'paid'
  order by p.id
  limit greatest(coalesce(p_limit, 1000), 1)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.publik_manifest_jadwal(uuid[], int, int) from public;
grant execute on function public.publik_manifest_jadwal(uuid[], int, int) to anon, authenticated;

notify pgrst, 'reload schema';
