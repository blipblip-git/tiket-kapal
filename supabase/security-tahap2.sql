-- =====================================================================
-- PENGAMANAN TAHAP 2 — TIKET KAPAL
-- Tujuan:
--   1. Pengunjung (anon) TIDAK BISA menulis apa pun ke database.
--   2. Petugas/agen/admin hanya bisa menulis data penyewanya sendiri.
--   3. Fee platform tidak bisa diubah/dihapus dari browser.
--   4. Tiket belum lunas tidak bisa di-boarding.
--   5. Pendaftaran umum (daftar-admin / registrasi-admin / daftar superadmin)
--      ditutup — akun hanya dibuat oleh pemilik platform.
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- Tabel fee platform (kalau migrasi fee belum pernah dijalankan).
create table if not exists public.pengaturan_platform (
  id uuid primary key default gen_random_uuid(),
  fee_platform bigint not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1. Kolom pendukung
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists fee bigint default 0;
alter table public.profiles add column if not exists password_hash text;
alter table public.pesanan add column if not exists fee_agen bigint default 0;
alter table public.pesanan add column if not exists fee_platform bigint default 0;

create index if not exists idx_profiles_auth_user on public.profiles(auth_user_id);
create index if not exists idx_profiles_operator on public.profiles(operator_id);
create index if not exists idx_kapal_operator on public.kapal(operator_id);
create index if not exists idx_jadwal_operator on public.jadwal(operator_id);
create index if not exists idx_pesanan_jadwal on public.pesanan(jadwal_id);
create index if not exists idx_kursi_jadwal on public.kursi(jadwal_id);
create index if not exists idx_pesanan_status_waktu on public.pesanan(status, waktu_pesan);

-- ---------------------------------------------------------------------
-- 2. Helper (SECURITY DEFINER: membaca profiles tanpa kena RLS berulang)
-- ---------------------------------------------------------------------
create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid() or p.id = auth.uid()
  limit 1
$$;

create or replace function public.my_operator_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(p.operator_id, p.id)
  from public.profiles p
  where (p.auth_user_id = auth.uid() or p.id = auth.uid())
    and coalesce(p.aktif, true)
  limit 1
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid())
      and lower(btrim(coalesce(p.role, ''))) = 'superadmin'
      and coalesce(p.aktif, true)
  )
$$;

create or replace function public.is_admin_utama() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid())
      and lower(btrim(coalesce(p.role, ''))) = 'admin_utama'
      and coalesce(p.aktif, true)
  )
$$;

-- true kalau pemanggil Superadmin atau kunci server (service_role).
-- Catatan: JANGAN memakai current_user di sini — di dalam fungsi SECURITY
-- DEFINER current_user berubah menjadi pemilik fungsi, bukan pemanggil.
create or replace function public.fn_istimewa() returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_superadmin()
    or coalesce(auth.role(), '') = 'service_role'
    or coalesce(current_setting('role', true), '') in ('service_role', 'postgres', 'supabase_admin')
    or (
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role'
$$;

create or replace function public.jadwal_izin(jid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jadwal j
    where j.id = jid
      and (
        j.operator_id = public.my_operator_id()
        or (
          j.operator_id is null
          and (
            j.kapal_id is null
            or exists (
              select 1 from public.kapal k
              where k.id = j.kapal_id
                and (k.operator_id = public.my_operator_id() or k.operator_id is null)
            )
          )
        )
      )
  )
$$;

create or replace function public.pesanan_izin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pesanan p
    where p.id = pid and public.jadwal_izin(p.jadwal_id)
  )
$$;

-- Dipakai policy baca publik (anon): hanya tiket lunas / pesanan baru.
create or replace function public.pesanan_publik_izin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pesanan p
    where p.id = pid
      and (p.status = 'paid' or p.waktu_pesan > now() - interval '15 minutes')
  )
$$;


-- ---------------------------------------------------------------------
-- 3. HAK AKSES TABEL
-- ---------------------------------------------------------------------
-- Anon: HANYA boleh membaca (tanpa insert/update/delete).
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Tabel yang tidak perlu dibaca pengunjung sama sekali.
revoke select on public.audit_log from anon;
revoke select on public.pengaturan_sistem from anon;

-- Profil: anon hanya boleh lihat kolom umum. Email & nomor HP staf TIDAK
-- boleh terbaca pengunjung (dipakai hanya oleh staf yang login).
revoke select on public.profiles from anon;
grant select (id, nama, role, lokasi, unit, nama_perusahaan, operator_id, aktif)
  on public.profiles to anon;

-- Katalog + tiket publik yang memang dibutuhkan halaman pembeli.
grant select on public.kapal to anon;
grant select on public.jadwal to anon;
grant select on public.kursi to anon;
grant select on public.template_jadwal to anon;
grant select on public.master_kota to anon;
grant select on public.master_rute to anon;
grant select on public.pengaturan_teks to anon;
grant select on public.pengaturan_platform to anon;
grant select on public.pesanan to anon;
grant select on public.pembayaran to anon;

-- Staf yang sudah login (Supabase Auth) butuh akses baca + tulis; RLS yang membatasi.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Server (service role) butuh akses penuh karena semua penulisan publik
-- sekarang lewat API route. Tanpa ini muncul "permission denied for table"
-- (42501) di endpoint /api/publik/* dan /api/superadmin/*.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- ---------------------------------------------------------------------
-- 4. BERSIHKAN POLICY LAMA (yang biasanya `using (true)`)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  tabel text[] := array[
    'profiles', 'kapal', 'jadwal', 'kursi', 'template_jadwal', 'master_kota',
    'master_rute', 'pengaturan_teks', 'pengaturan_platform', 'pengaturan_sistem',
    'pesanan', 'pembayaran', 'refund', 'audit_log'
  ];
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(tabel)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.kapal enable row level security;
alter table public.jadwal enable row level security;
alter table public.kursi enable row level security;
alter table public.template_jadwal enable row level security;
alter table public.master_kota enable row level security;
alter table public.master_rute enable row level security;
alter table public.pengaturan_teks enable row level security;
alter table public.pengaturan_platform enable row level security;
alter table public.pengaturan_sistem enable row level security;
alter table public.pesanan enable row level security;
alter table public.pembayaran enable row level security;
alter table public.refund enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------
-- 5. BACA (SELECT)
-- ---------------------------------------------------------------------
-- Pengunjung: katalog & tiket publik (sama seperti halaman pembeli sekarang).
create policy baca_publik_profiles on public.profiles for select to anon using (true);
create policy baca_publik_kapal on public.kapal for select to anon using (true);
create policy baca_publik_jadwal on public.jadwal for select to anon using (true);
create policy baca_publik_kursi on public.kursi for select to anon using (true);
create policy baca_publik_template on public.template_jadwal for select to anon using (true);
create policy baca_publik_kota on public.master_kota for select to anon using (true);
create policy baca_publik_rute on public.master_rute for select to anon using (true);
create policy baca_publik_teks on public.pengaturan_teks for select to anon using (true);
create policy baca_publik_platform on public.pengaturan_platform for select to anon using (true);

-- Pesanan publik: hanya tiket lunas + pesanan yang baru dibuat (15 menit
-- terakhir, untuk halaman pembayaran). Riwayat lama tidak bisa diunduh bebas.
create policy baca_publik_pesanan on public.pesanan for select to anon using (
  status = 'paid' or waktu_pesan > now() - interval '15 minutes'
);
create policy baca_publik_pembayaran on public.pembayaran for select to anon
  using (public.pesanan_publik_izin(pesanan_id));

-- Staf login: baca data operasional. audit_log dibatasi per penyewa.
create policy baca_staf_profiles on public.profiles for select to authenticated
  using (
    public.is_superadmin()
    or id = public.my_profile_id()
    or id = public.my_operator_id()
    or operator_id = public.my_operator_id()
  );
create policy baca_staf_kapal on public.kapal for select to authenticated using (true);
create policy baca_staf_jadwal on public.jadwal for select to authenticated using (true);
create policy baca_staf_kursi on public.kursi for select to authenticated using (true);
create policy baca_staf_template on public.template_jadwal for select to authenticated using (true);
create policy baca_staf_kota on public.master_kota for select to authenticated using (true);
create policy baca_staf_rute on public.master_rute for select to authenticated using (true);
create policy baca_staf_teks on public.pengaturan_teks for select to authenticated using (true);
create policy baca_staf_platform on public.pengaturan_platform for select to authenticated using (true);
create policy baca_staf_sistem on public.pengaturan_sistem for select to authenticated using (true);
create policy baca_staf_pesanan on public.pesanan for select to authenticated
  using (public.is_superadmin() or public.jadwal_izin(jadwal_id));
create policy baca_staf_pembayaran on public.pembayaran for select to authenticated
  using (public.is_superadmin() or public.pesanan_izin(pesanan_id));
create policy baca_staf_refund on public.refund for select to authenticated
  using (public.is_superadmin() or public.pesanan_izin(pesanan_id));
create policy baca_staf_audit on public.audit_log for select to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id());

-- ---------------------------------------------------------------------
-- 6. TULIS (INSERT / UPDATE / DELETE) — WAJIB MILIK PENYEWA SENDIRI
-- ---------------------------------------------------------------------
-- Profil: hanya Admin Utama (penyewa) yang boleh MENAMBAH/MENGHAPUS staf.
-- Setiap staf boleh mengubah datanya sendiri (ganti password/nama), tetapi
-- trigger fn_profil_jaga melarang ubah role/fee/password rekan kerja.
create policy tulis_profil_insert on public.profiles for insert to authenticated
  with check (
    public.is_superadmin()
    or (public.is_admin_utama() and operator_id = public.my_operator_id())
  );

create policy tulis_profil_update on public.profiles for update to authenticated
  using (
    public.is_superadmin()
    or id = public.my_profile_id()
    or (public.is_admin_utama() and operator_id = public.my_operator_id())
  )
  with check (
    public.is_superadmin()
    or id = public.my_profile_id()
    or (public.is_admin_utama() and operator_id = public.my_operator_id())
  );

create policy tulis_profil_delete on public.profiles for delete to authenticated
  using (
    public.is_superadmin()
    or (
      public.is_admin_utama()
      and operator_id = public.my_operator_id()
      and id <> public.my_profile_id()
    )
  );

-- Kapal / Template / Rute / Pengaturan Sistem: milik penyewa.
create policy tulis_kapal on public.kapal for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id() or operator_id is null)
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

create policy tulis_template on public.template_jadwal for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id() or operator_id is null)
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

create policy tulis_rute on public.master_rute for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id() or operator_id is null)
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

create policy tulis_sistem on public.pengaturan_sistem for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id() or operator_id is null)
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

-- Jadwal ikut operator kapal/penyewa.
create policy tulis_jadwal on public.jadwal for all to authenticated
  using (
    public.is_superadmin()
    or operator_id = public.my_operator_id()
    or operator_id is null
    or public.jadwal_izin(id)
  )
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

-- Kursi ikut jadwalnya.
create policy tulis_kursi on public.kursi for all to authenticated
  using (public.is_superadmin() or public.jadwal_izin(jadwal_id))
  with check (public.is_superadmin() or public.jadwal_izin(jadwal_id));

-- Pesanan: hanya untuk jadwal milik penyewa.
create policy tulis_pesanan on public.pesanan for all to authenticated
  using (public.is_superadmin() or public.jadwal_izin(jadwal_id))
  with check (public.is_superadmin() or public.jadwal_izin(jadwal_id));

-- Pembayaran & refund ikut pesanannya.
create policy tulis_pembayaran on public.pembayaran for all to authenticated
  using (public.is_superadmin() or public.pesanan_izin(pesanan_id))
  with check (public.is_superadmin() or public.pesanan_izin(pesanan_id));

create policy tulis_refund on public.refund for all to authenticated
  using (public.is_superadmin() or public.pesanan_izin(pesanan_id))
  with check (public.is_superadmin() or public.pesanan_izin(pesanan_id));

-- Audit log: staf boleh mencatat, tidak boleh mengubah/menghapus.
create policy tulis_audit on public.audit_log for insert to authenticated
  with check (
    public.is_superadmin()
    or operator_id = public.my_operator_id()
    or operator_id is null
  );

-- Dua tabel ini KHUSUS Superadmin (tidak bisa disentuh penyewa).
create policy tulis_kota on public.master_kota for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy tulis_teks on public.pengaturan_teks for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy tulis_platform on public.pengaturan_platform for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());


-- ---------------------------------------------------------------------
-- 7. TRIGGER: OPERATOR OTOMATIS + PROTEKSI DATA
-- ---------------------------------------------------------------------
create or replace function public.fn_isi_operator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.fn_istimewa() then
    return new;
  end if;

  if new.operator_id is null or new.operator_id <> public.my_operator_id() then
    new.operator_id := public.my_operator_id();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_operator_kapal on public.kapal;
create trigger trg_operator_kapal before insert or update on public.kapal
  for each row execute function public.fn_isi_operator();

drop trigger if exists trg_operator_jadwal on public.jadwal;
create trigger trg_operator_jadwal before insert or update on public.jadwal
  for each row execute function public.fn_isi_operator();

drop trigger if exists trg_operator_template on public.template_jadwal;
create trigger trg_operator_template before insert or update on public.template_jadwal
  for each row execute function public.fn_isi_operator();

drop trigger if exists trg_operator_rute on public.master_rute;
create trigger trg_operator_rute before insert or update on public.master_rute
  for each row execute function public.fn_isi_operator();

drop trigger if exists trg_operator_sistem on public.pengaturan_sistem;
create trigger trg_operator_sistem before insert or update on public.pengaturan_sistem
  for each row execute function public.fn_isi_operator();

drop trigger if exists trg_operator_audit on public.audit_log;
create trigger trg_operator_audit before insert on public.audit_log
  for each row execute function public.fn_isi_operator();

-- Profil: cegah naik pangkat jadi superadmin, pindah penyewa, atau mengganti
-- status/fee/password rekan kerja.
create or replace function public.fn_profil_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  saya uuid := public.my_profile_id();
begin
  if public.fn_istimewa() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if lower(btrim(coalesce(new.role, ''))) in ('superadmin', 'admin_utama') then
      raise exception 'Akun admin hanya boleh dibuat oleh pemilik platform.';
    end if;
    if new.operator_id is null then
      new.operator_id := public.my_operator_id();
    end if;
    new.auth_user_id := null;
    return new;
  end if;

  if lower(btrim(coalesce(new.role, ''))) = 'superadmin'
     and lower(btrim(coalesce(old.role, ''))) <> 'superadmin' then
    raise exception 'Role tidak boleh diubah menjadi Superadmin.';
  end if;

  if lower(btrim(coalesce(new.role, ''))) = 'admin_utama'
     and lower(btrim(coalesce(old.role, ''))) <> 'admin_utama' then
    raise exception 'Role Admin Utama tidak boleh diberikan dari aplikasi.';
  end if;

  if coalesce(new.role, '') is distinct from coalesce(old.role, '')
     and not public.is_admin_utama() then
    raise exception 'Role hanya boleh diubah oleh Admin Utama.';
  end if;

  new.id := old.id;
  new.operator_id := old.operator_id;
  new.auth_user_id := old.auth_user_id;

  -- Fee per tiket & status aktif hanya Admin Utama (cegah staf menaikkan
  -- fee-nya sendiri atau mengaktifkan diri setelah dinonaktifkan).
  if not public.is_admin_utama() then
    new.aktif := old.aktif;
    new.fee := old.fee;
  end if;

  if new.password_hash is distinct from old.password_hash
     and new.id is distinct from saya
     and not public.is_admin_utama() then
    raise exception 'Hanya Admin Utama yang boleh mengganti password staf lain.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profil_jaga on public.profiles;
create trigger trg_profil_jaga before insert or update on public.profiles
  for each row execute function public.fn_profil_jaga();

-- Fee platform hanya Superadmin.
create or replace function public.fn_platform_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_istimewa() then
    raise exception 'Fee platform hanya boleh diubah oleh Superadmin.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_platform_jaga on public.pengaturan_platform;
create trigger trg_platform_jaga before insert or update on public.pengaturan_platform
  for each row execute function public.fn_platform_jaga();


-- ---------------------------------------------------------------------
-- 8. FEE: SNAPSHOT DIPAKSA DARI SERVER (bukan dari browser)
-- ---------------------------------------------------------------------
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
    -- fee_offline/fee_online ditambahkan oleh supabase/fee-kanal.sql.
    select coalesce(fee_offline, fee_platform, 0), coalesce(fee_online, 0)
      into fee_off, fee_on
    from public.pengaturan_platform
    order by updated_at desc nulls last
    limit 1;
  exception when others then
    fee_off := 0;
    fee_on  := 0;
  end;

  if kanal = 'online' then
    -- ONLINE: hanya tarif online, tanpa fee agen/offline (tidak dijumlah).
    fee_plat := coalesce(fee_on, 0);
    fee_agt  := 0;
  else
    -- OFFLINE: tarif offline + fee agen (hanya penjualan kanal 'agen').
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

-- Fee yang sudah dibekukan tidak boleh diubah; tiket belum lunas tidak boleh
-- di-boarding.
create or replace function public.fn_pesanan_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_istimewa() then
    new.fee_platform := old.fee_platform;
    new.fee_agen := old.fee_agen;
  end if;

  if coalesce(new.status_boarding, 'belum') = 'sudah'
     and coalesce(new.status, '') <> 'paid' then
    raise exception 'Boarding ditolak: tiket belum lunas (status %).', coalesce(new.status, 'pending');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pesanan_jaga on public.pesanan;
create trigger trg_pesanan_jaga before update on public.pesanan
  for each row execute function public.fn_pesanan_jaga();

-- Pesanan yang sudah dibayar tidak boleh dihapus (biar laporan fee utuh).
create or replace function public.fn_hapus_pesanan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'paid' and not public.fn_istimewa() then
    raise exception 'Pesanan yang sudah dibayar tidak boleh dihapus. Gunakan menu Refund.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_hapus_pesanan on public.pesanan;
create trigger trg_hapus_pesanan before delete on public.pesanan
  for each row execute function public.fn_hapus_pesanan();

-- ---------------------------------------------------------------------
-- 9. CEK AKHIR
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

