-- ============================================================
-- MIGRASI FEE PER KANAL (OFFLINE 3.000 / ONLINE 5.000)
-- Jalankan sekali di Supabase -> SQL Editor. Aman dijalankan berulang.
--
-- Aturan baru:
-- - OFFLINE (petugas/agen): fee platform = fee_offline (tidak ditambah fee online).
-- - ONLINE  (web)          : fee platform = fee_online  (tidak ditambah fee offline,
--                            dan fee agen selalu 0).
-- - Fee agen (profiles.fee) HANYA berlaku untuk kanal 'agen', jadi penjualan
--   petugas tidak pernah kena fee agen.
-- ============================================================

-- 1) Tarif terpisah per kanal.
alter table public.pengaturan_platform add column if not exists fee_offline bigint not null default 0;
alter table public.pengaturan_platform add column if not exists fee_online  bigint not null default 0;

-- 2) Nilai awal hanya diisi kalau belum pernah diatur (tidak menimpa isian Superadmin).
update public.pengaturan_platform
set fee_offline = 3000,
    fee_online  = 5000,
    fee_platform = 3000,          -- kolom lama: cermin tarif offline
    updated_by  = 'migrasi fee kanal',
    updated_at  = now()
where fee_offline = 0
  and fee_online = 0;

-- Kalau kolom fee_platform lama sudah berisi angka tetapi fee_offline masih 0,
-- pakai angka lama itu sebagai tarif offline (online tidak diubah).
update public.pengaturan_platform
set fee_offline = fee_platform
where fee_offline = 0
  and fee_platform > 0;

-- 3) Rapikan label kanal lama -> 3 kanal saja: petugas / agen / online.
update public.pesanan
set kanal = 'petugas'
where kanal in ('loket', 'mobile', 'keberangkatan');

-- 4) Snapshot fee saat menjual: pilih tarif sesuai kanal (TIDAK dijumlah).
create or replace function public.fn_fee_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fee_off  bigint := 0;
  fee_on   bigint := 0;
  fee_plat bigint := 0;
  fee_agt  bigint := 0;
  kanal    text := lower(btrim(coalesce(new.kanal, '')));
  penjual  text := lower(btrim(coalesce(new.petugas_jual, '')));
  hp       text := regexp_replace(coalesce(new.petugas_jual, ''), '\D', '', 'g');
begin
  begin
    select coalesce(fee_offline, fee_platform, 0), coalesce(fee_online, 0)
      into fee_off, fee_on
    from public.pengaturan_platform
    order by updated_at desc nulls last
    limit 1;
  exception when others then
    -- Kolom/tabel belum ada (migrasi belum jalan): jangan gagalkan penjualan.
    fee_off := 0;
    fee_on  := 0;
  end;

  if kanal = 'online' then
    -- ONLINE: hanya tarif online, tanpa fee agen/offline.
    fee_plat := coalesce(fee_on, 0);
    fee_agt  := 0;
  else
    -- OFFLINE: fee platform offline + fee agen (khusus penjualan agen).
    fee_plat := coalesce(fee_off, 0);
    if kanal = 'agen' and penjual <> '' then
      select coalesce(fee, 0) into fee_agt
      from public.profiles
      where (
        (penjual <> '' and lower(coalesce(email, '')) = penjual)
        or (hp <> '' and regexp_replace(coalesce(nomor_hp, ''), '\D', '', 'g') = hp)
      )
      limit 1;
    end if;
  end if;

  new.fee_platform := coalesce(fee_plat, 0);
  new.fee_agen := coalesce(fee_agt, 0);
  return new;
end;
$$;

drop trigger if exists trg_fee_snapshot on public.pesanan;
create trigger trg_fee_snapshot before insert on public.pesanan
  for each row execute function public.fn_fee_snapshot();
