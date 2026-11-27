-- ============================================================
-- WADAH DANA PER KAPAL (transaksi per kapal, transfer per PT)
-- Jalankan SETELAH supabase/tagihan-online.sql. Aman dijalankan berulang.
--
-- Aturan yang dikunci di database:
--   1. Setiap tagihan menempel ke satu kapal (kapal_id + snapshot
--      kode_kapal / nama_kapal), jadi pembelian kapal Sadewa tidak mungkin
--      masuk ke wadah kapal lain.
--   2. Kapal harus milik PT (operator) yang sama dengan tagihan -> trigger
--      menolak kalau beda. Inilah pengaman "tidak tercampur".
--   3. Pencairan BUKAN per tiket: satu wadah per kapal per tanggal closing
--      (unique kapal_id + tanggal), lalu digabung jadi SATU transfer per PT.
--   4. Satu wadah kapal hanya boleh masuk satu batch transfer
--      (unique transfer_pemilik_item.closing_kapal_id) -> tidak bisa dibayar 2x.
--
-- Istilah:
--   kapal = wadah TRANSAKSI (closing mengikuti jadwal kapal)
--   PT    = wadah UANG / penerima transfer (profiles role admin_utama,
--           nama di profiles.nama_perusahaan)
-- ============================================================

-- ---------- 1) Kode kapal: identitas wadah yang pendek & unik ----------
-- Dipakai sebagai awalan kode bayar, mis. SDW-261127-K7Q2. Dari mutasi bank
-- admin langsung tahu uang itu milik kapal mana tanpa membuka aplikasi.
alter table public.kapal add column if not exists kode text;

with akar as (
  select
    k.id,
    k.operator_id,
    coalesce(
      nullif(
        upper(substr(regexp_replace(coalesce(nullif(trim(k.nama), ''), 'KAPAL'), '[^A-Za-z0-9]', '', 'g'), 1, 3)),
        ''
      ),
      'KPL'
    ) as dasar
  from public.kapal k
  where k.kode is null or trim(k.kode) = ''
), berurut as (
  select id, dasar, row_number() over (partition by operator_id, dasar order by id) as rn
  from akar
)
update public.kapal k
set kode = b.dasar || case when b.rn = 1 then '' else b.rn::text end
from berurut b
where k.id = b.id;

create unique index if not exists idx_kapal_kode_unik on public.kapal (operator_id, kode);

-- ---------- 2) Tagihan: jejak kapal + jadwal + snapshot nama ----------
-- Snapshot disimpan supaya laporan lama tidak berubah kalau nama kapal atau
-- nama PT diganti di kemudian hari.
alter table public.tagihan add column if not exists kapal_id uuid references public.kapal(id) on delete set null;
alter table public.tagihan add column if not exists jadwal_id uuid references public.jadwal(id) on delete set null;
alter table public.tagihan add column if not exists kode_kapal text;
alter table public.tagihan add column if not exists nama_kapal text;
alter table public.tagihan add column if not exists nama_pt text;
alter table public.tagihan add column if not exists closing_kapal_id uuid;

create index if not exists idx_tagihan_kapal on public.tagihan (kapal_id, created_at desc);
create index if not exists idx_tagihan_kode_kapal on public.tagihan (kode_kapal, created_at desc);

-- ---------- 3) Wadah closing per kapal per tanggal ----------
create table if not exists public.closing_kapal (
  id                  uuid primary key default gen_random_uuid(),
  operator_id         uuid,
  kapal_id            uuid references public.kapal(id) on delete set null,
  kode_kapal          text,
  nama_kapal          text,
  nama_pt             text,
  tanggal             date not null,
  -- terbuka -> dihitung -> ditransfer -> selesai | dibatalkan
  status              text not null default 'terbuka',
  jumlah_tagihan      int not null default 0,
  jumlah_tiket        int not null default 0,
  total_dasar         bigint not null default 0,
  total_biaya_layanan bigint not null default 0,
  total_mdr           bigint not null default 0,
  bagian_pemilik      bigint not null default 0,
  bagian_platform     bigint not null default 0,
  bagian_agen         bigint not null default 0,
  rekening_id         uuid references public.rekening_penerima(id) on delete set null,
  bukti_url           text,
  catatan             text,
  ditutup_oleh        uuid,
  ditutup_at          timestamptz,
  ditransfer_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_closing_kapal_unik on public.closing_kapal (kapal_id, tanggal);
create index if not exists idx_closing_kapal_pt on public.closing_kapal (operator_id, tanggal desc);

alter table public.tagihan drop constraint if exists tagihan_closing_kapal_fk;
alter table public.tagihan
  add constraint tagihan_closing_kapal_fk
  foreign key (closing_kapal_id) references public.closing_kapal(id) on delete set null;

-- ---------- 4) Satu transfer per PT, boleh berisi banyak kapal ----------
create table if not exists public.transfer_pemilik (
  id              uuid primary key default gen_random_uuid(),
  operator_id     uuid not null,
  nama_pt         text,
  periode_dari    date not null,
  periode_sampai  date not null,
  jumlah_kapal    int not null default 0,
  nominal         bigint not null default 0,
  rekening_id     uuid references public.rekening_penerima(id) on delete set null,
  bank_kode       text,
  nomor_rekening  text,
  nama_rekening   text,
  -- menunggu -> dikirim -> selesai | gagal
  status          text not null default 'menunggu',
  pg_ref          text,
  bukti_url       text,
  catatan         text,
  dibuat_oleh     uuid,
  dibuat_at       timestamptz not null default now(),
  dikirim_at      timestamptz
);

create index if not exists idx_transfer_pemilik_pt on public.transfer_pemilik (operator_id, dibuat_at desc);

create table if not exists public.transfer_pemilik_item (
  id               uuid primary key default gen_random_uuid(),
  transfer_id      uuid not null references public.transfer_pemilik(id) on delete cascade,
  closing_kapal_id uuid not null references public.closing_kapal(id) on delete restrict,
  kapal_id         uuid,
  kode_kapal       text,
  nama_kapal       text,
  tanggal          date,
  nominal          bigint not null default 0,
  created_at       timestamptz not null default now(),
  -- satu wadah kapal hanya boleh dibayar sekali
  unique (closing_kapal_id)
);

create index if not exists idx_transfer_item_transfer on public.transfer_pemilik_item (transfer_id);

-- ---------- 5) Trigger: kapal wajib satu PT + isi snapshot ----------
create or replace function public.cek_tagihan_kapal() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  k record;
  n text;
begin
  if new.kapal_id is not null then
    select id, operator_id, kode, nama into k from public.kapal where id = new.kapal_id;
    if not found then
      raise exception 'Kapal % tidak ditemukan', new.kapal_id;
    end if;
    if k.operator_id is not null and new.operator_id is not null and k.operator_id <> new.operator_id then
      raise exception 'Wadah tidak boleh tercampur: kapal % milik operator %, bukan %',
        k.nama, k.operator_id, new.operator_id;
    end if;
    new.operator_id := coalesce(new.operator_id, k.operator_id);
    new.kode_kapal := coalesce(new.kode_kapal, k.kode);
    new.nama_kapal := coalesce(new.nama_kapal, k.nama);
  end if;

  if new.operator_id is not null then
    select coalesce(nullif(trim(nama_perusahaan), ''), nullif(trim(nama), '')) into n
    from public.profiles where id = new.operator_id;
    new.nama_pt := coalesce(new.nama_pt, n);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cek_tagihan_kapal on public.tagihan;
create trigger trg_cek_tagihan_kapal
  before insert or update of kapal_id, operator_id on public.tagihan
  for each row execute function public.cek_tagihan_kapal();

-- ---------- 6) Hitung isi wadah satu kapal satu tanggal ----------
create or replace function public.hitung_wadah_kapal(p_kapal_id uuid, p_tanggal date)
returns table (
  operator_id         uuid,
  jumlah_tagihan      int,
  jumlah_tiket        int,
  total_dasar         bigint,
  total_biaya_layanan bigint,
  total_mdr           bigint,
  bagian_pemilik      bigint,
  bagian_platform     bigint,
  bagian_agen         bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    t.operator_id,
    count(*)::int,
    coalesce(sum(t.jumlah_tiket), 0)::int,
    coalesce(sum(t.dasar), 0)::bigint,
    coalesce(sum(t.biaya_layanan), 0)::bigint,
    coalesce(sum(coalesce(t.mdr_aktual, t.mdr_estimasi)), 0)::bigint,
    coalesce(sum(s.pemilik), 0)::bigint,
    coalesce(sum(s.platform), 0)::bigint,
    coalesce(sum(s.agen), 0)::bigint
  from public.tagihan t
  join public.jadwal j on j.id = t.jadwal_id
  left join lateral (
    select
      sum(sp.nominal) filter (where sp.penerima_tipe = 'pemilik')  as pemilik,
      sum(sp.nominal) filter (where sp.penerima_tipe = 'platform') as platform,
      sum(sp.nominal) filter (where sp.penerima_tipe = 'agen')     as agen
    from public.tagihan_split sp
    where sp.tagihan_id = t.id
  ) s on true
  where t.kapal_id = p_kapal_id
    and t.status = 'paid'
    and j.tanggal = p_tanggal
  group by t.operator_id;
$$;

-- ---------- 7) Tutup wadah kapal (dipanggil setelah closing jadwal) ----------
create or replace function public.tutup_wadah_kapal(
  p_kapal_id uuid,
  p_tanggal date,
  p_oleh uuid default null
)
returns public.closing_kapal
language plpgsql
set search_path = public, pg_temp
as $$
declare
  k record;
  w record;
  hasil public.closing_kapal;
begin
  select id, operator_id, kode, nama into k from public.kapal where id = p_kapal_id;
  if not found then
    raise exception 'Kapal % tidak ditemukan', p_kapal_id;
  end if;

  select * into w from public.hitung_wadah_kapal(p_kapal_id, p_tanggal);
  if w is null or coalesce(w.jumlah_tagihan, 0) = 0 then
    raise exception 'Belum ada tagihan lunas untuk kapal % tanggal %', k.nama, p_tanggal;
  end if;

  insert into public.closing_kapal (
    operator_id, kapal_id, kode_kapal, nama_kapal, nama_pt, tanggal, status,
    jumlah_tagihan, jumlah_tiket, total_dasar, total_biaya_layanan, total_mdr,
    bagian_pemilik, bagian_platform, bagian_agen, ditutup_oleh, ditutup_at
  )
  values (
    w.operator_id, k.id, k.kode, k.nama,
    (select coalesce(nullif(trim(nama_perusahaan), ''), nullif(trim(nama), ''))
       from public.profiles where id = w.operator_id),
    p_tanggal, 'dihitung',
    w.jumlah_tagihan, w.jumlah_tiket, w.total_dasar, w.total_biaya_layanan, w.total_mdr,
    w.bagian_pemilik, w.bagian_platform, w.bagian_agen, p_oleh, now()
  )
  on conflict (kapal_id, tanggal) do update set
    operator_id         = excluded.operator_id,
    kode_kapal          = excluded.kode_kapal,
    nama_kapal          = excluded.nama_kapal,
    nama_pt             = excluded.nama_pt,
    jumlah_tagihan      = excluded.jumlah_tagihan,
    jumlah_tiket        = excluded.jumlah_tiket,
    total_dasar         = excluded.total_dasar,
    total_biaya_layanan = excluded.total_biaya_layanan,
    total_mdr           = excluded.total_mdr,
    bagian_pemilik      = excluded.bagian_pemilik,
    bagian_platform     = excluded.bagian_platform,
    bagian_agen         = excluded.bagian_agen,
    status              = case when public.closing_kapal.status = 'selesai'
                              then public.closing_kapal.status else 'dihitung' end,
    ditutup_oleh        = coalesce(excluded.ditutup_oleh, public.closing_kapal.ditutup_oleh),
    ditutup_at          = coalesce(public.closing_kapal.ditutup_at, excluded.ditutup_at),
    updated_at          = now()
  returning * into hasil;

  update public.tagihan t
  set closing_kapal_id = hasil.id, updated_at = now()
  from public.jadwal j
  where j.id = t.jadwal_id
    and t.kapal_id = p_kapal_id
    and t.status = 'paid'
    and j.tanggal = p_tanggal
    and t.closing_kapal_id is distinct from hasil.id;

  return hasil;
end;
$$;

-- ---------- 8) Siapkan SATU transfer untuk semua kapal milik satu PT ----------
-- Menggabungkan semua wadah kapal yang belum dibayar dalam rentang tanggal,
-- jadi biaya transfer Rp3.000 tidak dikali jumlah kapal.
create or replace function public.siapkan_transfer_pemilik(
  p_operator_id uuid,
  p_dari date,
  p_sampai date,
  p_oleh uuid default null
)
returns public.transfer_pemilik
language plpgsql
set search_path = public, pg_temp
as $$
declare
  hasil public.transfer_pemilik;
  r record;
  rek record;
  total bigint := 0;
  jumlah int := 0;
  nama_pt_var text;
begin
  select coalesce(nullif(trim(pr.nama_perusahaan), ''), nullif(trim(pr.nama), '')) into nama_pt_var
  from public.profiles pr where pr.id = p_operator_id;

  select * into rek from public.rekening_penerima
  where pemilik_id = p_operator_id and status = 'aktif' and tipe = 'bank'
  order by created_at desc limit 1;

  if not found then
    raise exception 'PT % belum punya rekening bank berstatus aktif', coalesce(nama_pt_var, p_operator_id::text);
  end if;

  select count(*), coalesce(sum(c.bagian_pemilik), 0)
    into jumlah, total
  from public.closing_kapal c
  where c.operator_id = p_operator_id
    and c.tanggal between p_dari and p_sampai
    and c.status = 'dihitung'
    and c.bagian_pemilik > 0
    and not exists (
      select 1 from public.transfer_pemilik_item i where i.closing_kapal_id = c.id
    );

  if jumlah = 0 then
    raise exception 'Tidak ada wadah kapal yang siap ditransfer untuk PT % periode % s/d %',
      coalesce(nama_pt_var, p_operator_id::text), p_dari, p_sampai;
  end if;

  insert into public.transfer_pemilik (
    operator_id, nama_pt, periode_dari, periode_sampai, jumlah_kapal, nominal,
    rekening_id, bank_kode, nomor_rekening, nama_rekening, status, dibuat_oleh
  ) values (
    p_operator_id, nama_pt_var, p_dari, p_sampai, jumlah, total,
    rek.id, rek.bank_kode, rek.nomor, rek.nama_pemilik, 'menunggu', p_oleh
  )
  returning * into hasil;

  for r in
    select c.* from public.closing_kapal c
    where c.operator_id = p_operator_id
      and c.tanggal between p_dari and p_sampai
      and c.status = 'dihitung'
      and c.bagian_pemilik > 0
      and not exists (
        select 1 from public.transfer_pemilik_item i where i.closing_kapal_id = c.id
      )
    order by c.tanggal, c.nama_kapal
  loop
    insert into public.transfer_pemilik_item (
      transfer_id, closing_kapal_id, kapal_id, kode_kapal, nama_kapal, tanggal, nominal
    ) values (
      hasil.id, r.id, r.kapal_id, r.kode_kapal, r.nama_kapal, r.tanggal, r.bagian_pemilik
    );

    update public.closing_kapal
    set status = 'ditransfer', rekening_id = rek.id, ditransfer_at = now(), updated_at = now()
    where id = r.id;
  end loop;

  return hasil;
end;
$$;

revoke all on function public.hitung_wadah_kapal(uuid, date) from public;
revoke all on function public.tutup_wadah_kapal(uuid, date, uuid) from public;
revoke all on function public.siapkan_transfer_pemilik(uuid, date, date, uuid) from public;
grant execute on function public.hitung_wadah_kapal(uuid, date) to service_role;
grant execute on function public.tutup_wadah_kapal(uuid, date, uuid) to service_role;
grant execute on function public.siapkan_transfer_pemilik(uuid, date, date, uuid) to service_role;

-- ---------- 9) View rekap wadah (aman untuk halaman laporan) ----------
create or replace view public.v_wadah_kapal
with (security_invoker = true) as
select
  t.operator_id,
  max(coalesce(t.nama_pt, p.nama_perusahaan, p.nama)) as nama_pt,
  t.kapal_id,
  max(coalesce(t.kode_kapal, k.kode))                 as kode_kapal,
  max(coalesce(t.nama_kapal, k.nama))                 as nama_kapal,
  coalesce(j.tanggal, t.created_at::date)             as tanggal,
  count(*)                                            as jumlah_tagihan,
  coalesce(sum(t.jumlah_tiket), 0)                    as jumlah_tiket,
  coalesce(sum(t.dasar), 0)                           as total_dasar,
  coalesce(sum(t.biaya_layanan), 0)                   as total_biaya_layanan,
  coalesce(sum(coalesce(t.mdr_aktual, t.mdr_estimasi)), 0) as total_mdr,
  coalesce(sum(s.pemilik), 0)                         as bagian_pemilik,
  coalesce(sum(s.platform), 0)                        as bagian_platform,
  coalesce(sum(s.agen), 0)                            as bagian_agen,
  coalesce(sum(s.ditahan), 0)                         as ditahan,
  coalesce(sum(s.dicairkan), 0)                       as dicairkan
from public.tagihan t
left join public.jadwal j on j.id = t.jadwal_id
left join public.kapal k on k.id = t.kapal_id
left join public.profiles p on p.id = t.operator_id
left join lateral (
  select
    sum(sp.nominal) filter (where sp.penerima_tipe = 'pemilik')         as pemilik,
    sum(sp.nominal) filter (where sp.penerima_tipe = 'platform')        as platform,
    sum(sp.nominal) filter (where sp.penerima_tipe = 'agen')            as agen,
    sum(sp.nominal) filter (where sp.status in ('menunggu', 'ditahan')) as ditahan,
    sum(sp.nominal) filter (where sp.status = 'selesai')                as dicairkan
  from public.tagihan_split sp
  where sp.tagihan_id = t.id
) s on true
where t.status = 'paid'
group by t.operator_id, t.kapal_id, coalesce(j.tanggal, t.created_at::date);

create or replace view public.v_wadah_pemilik
with (security_invoker = true) as
select
  w.operator_id,
  max(w.nama_pt)             as nama_pt,
  w.tanggal,
  count(distinct w.kapal_id) as jumlah_kapal,
  sum(w.jumlah_tagihan)      as jumlah_tagihan,
  sum(w.jumlah_tiket)        as jumlah_tiket,
  sum(w.total_dasar)         as total_dasar,
  sum(w.bagian_pemilik)      as bagian_pemilik,
  sum(w.bagian_platform)     as bagian_platform,
  sum(w.bagian_agen)         as bagian_agen,
  sum(w.ditahan)             as ditahan,
  sum(w.dicairkan)           as dicairkan
from public.v_wadah_kapal w
group by w.operator_id, w.tanggal;

-- ---------- 10) RLS + grant ----------
alter table public.closing_kapal          enable row level security;
alter table public.transfer_pemilik       enable row level security;
alter table public.transfer_pemilik_item  enable row level security;

drop policy if exists closing_kapal_baca on public.closing_kapal;
create policy closing_kapal_baca on public.closing_kapal for select
  using (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists closing_kapal_kelola on public.closing_kapal;
create policy closing_kapal_kelola on public.closing_kapal for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists transfer_pemilik_baca on public.transfer_pemilik;
create policy transfer_pemilik_baca on public.transfer_pemilik for select
  using (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists transfer_pemilik_kelola on public.transfer_pemilik;
create policy transfer_pemilik_kelola on public.transfer_pemilik for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists transfer_item_baca on public.transfer_pemilik_item;
create policy transfer_item_baca on public.transfer_pemilik_item for select
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.transfer_pemilik tp
      where tp.id = transfer_pemilik_item.transfer_id
        and tp.operator_id = public.my_operator_id()
    )
  );

drop policy if exists transfer_item_kelola on public.transfer_pemilik_item;
create policy transfer_item_kelola on public.transfer_pemilik_item for all
  using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.closing_kapal, public.transfer_pemilik, public.transfer_pemilik_item to authenticated;
grant select on public.v_wadah_kapal, public.v_wadah_pemilik to authenticated;
grant all on public.closing_kapal, public.transfer_pemilik, public.transfer_pemilik_item to service_role;
