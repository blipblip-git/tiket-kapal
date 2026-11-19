-- ============================================================
-- HAPUS PENYEWA (TOTAL) — jalankan SEKALI di SQL Editor Supabase
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- 1) Catatan identitas penyewa yang dihapus.
--    Isinya HANYA 4 data: nama pemilik, nama perusahaan, email, no HP.
--    (kolom id hanya identitas baris, bukan data tambahan)
create table if not exists public.penyewa_dihapus (
  id uuid primary key default gen_random_uuid(),
  nama_pemilik text,
  nama_perusahaan text,
  email text,
  nomor_hp text
);

-- 2) Fungsi purge: hapus SEMUA data milik 1 penyewa secara atomik.
--    Urutan: refund -> pembayaran -> pesanan -> kursi -> jadwal ->
--    template_jadwal -> kapal -> master_rute -> pengaturan_sistem ->
--    audit_log -> staf -> akun penyewa.
create or replace function public.hapus_penyewa_total(
  p_id uuid,
  p_nama_pemilik text,
  p_nama_perusahaan text,
  p_email text,
  p_nomor_hp text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jadwal uuid[];
  v_pesanan uuid[];
  v_kapal uuid[];
begin
  -- catat identitas (4 field saja)
  insert into public.penyewa_dihapus (nama_pemilik, nama_perusahaan, email, nomor_hp)
  values (p_nama_pemilik, p_nama_perusahaan, p_email, p_nomor_hp);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_kapal
  from public.kapal where operator_id = p_id;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_jadwal
  from public.jadwal
  where operator_id = p_id or kapal_id = any(v_kapal);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_pesanan
  from public.pesanan where jadwal_id = any(v_jadwal);

  delete from public.refund where pesanan_id = any(v_pesanan) or jadwal_id = any(v_jadwal);
  delete from public.pembayaran where pesanan_id = any(v_pesanan);
  delete from public.pesanan where jadwal_id = any(v_jadwal);
  delete from public.kursi where jadwal_id = any(v_jadwal);
  delete from public.jadwal where id = any(v_jadwal);
  delete from public.template_jadwal where operator_id = p_id or kapal_id = any(v_kapal);
  delete from public.kapal where id = any(v_kapal);
  delete from public.master_rute where operator_id = p_id;
  delete from public.pengaturan_sistem where operator_id = p_id;
  delete from public.audit_log where operator_id = p_id;
  delete from public.profiles where operator_id = p_id and id <> p_id;
  delete from public.profiles where id = p_id;

  return jsonb_build_object(
    'kapal', coalesce(array_length(v_kapal, 1), 0),
    'jadwal', coalesce(array_length(v_jadwal, 1), 0),
    'pesanan', coalesce(array_length(v_pesanan, 1), 0)
  );
end;
$$;

-- 3) Izin untuk API route (service role)
grant select, insert, update, delete on public.penyewa_dihapus to service_role;
grant execute on function public.hapus_penyewa_total(uuid, text, text, text, text) to service_role;

-- 4) Bersihkan baris pengaturan_sistem yatim (operator_id sudah tidak ada profilnya)
delete from public.pengaturan_sistem ps
where ps.operator_id is not null
  and not exists (select 1 from public.profiles p where p.id = ps.operator_id);

-- 5) Supaya fungsi langsung dikenali PostgREST
notify pgrst, 'reload schema';
