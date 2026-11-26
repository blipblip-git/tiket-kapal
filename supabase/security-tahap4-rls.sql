-- =====================================================================
-- PENGAMANAN TAHAP 4 — BATAS PENYEWA UNTUK KATALOG & KUNCI KURSI
-- Tujuan:
--   1. Staf yang login TIDAK BISA lagi membaca katalog (kapal, jadwal,
--      kursi, template, rute, pengaturan) milik penyewa lain. Sebelumnya
--      policy baca `authenticated` masih `using (true)`.
--   2. `kursi_pakai` (kunci kursi) hanya bisa ditulis untuk kapal milik
--      penyewa sendiri. Sebelumnya siapa pun yang login bisa insert/delete
--      kunci kursi semua penyewa — celah paling berbahaya.
--   3. Akun lintas penyewa yang memang sah tetap bisa membaca:
--      Superadmin dan Syahbandar (port authority).
--   4. Baris global (`operator_id NULL`) tetap bisa dibaca, tetapi hanya
--      Superadmin yang boleh mengubah/menghapus — mencegah penyewa mengklaim
--      pengaturan platform atau katalog global lewat trigger operator.
--
-- Jalankan SETELAH:
--   security-tahap2.sql -> security-tahap2b-grant.sql ->
--   security-tahap3-publik.sql -> kursi-segmen.sql
--
-- Kalau `security-tahap2.sql` atau `kursi-segmen.sql` dijalankan ULANG,
-- jalankan file ini lagi karena file lama akan mengembalikan policy `true`.
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HELPER: role lintas penyewa
-- ---------------------------------------------------------------------
-- Syahbandar memang harus melihat manifest/katalog semua daerah, tetapi
-- bukan penyewa: profiles.operator_id-nya NULL. Tanpa helper ini, policy
-- per-operator akan mengosongkan halaman /syahbandar.
create or replace function public.is_syahbandar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid())
      and lower(btrim(coalesce(p.role, ''))) = 'syahbandar'
      and coalesce(p.aktif, true)
  )
$$;

-- ---------------------------------------------------------------------
-- 2. HELPER: kepemilikan kunci kursi
-- ---------------------------------------------------------------------
-- Format keberangkatan_key = "kapal_id|tanggal|jam" (lihat kursi-segmen.sql).
-- Jadi penyewa pemilik kunci bisa ditentukan dari bagian pertama key.
create or replace function public.kursi_pakai_izin(kunci text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.kapal k
    where k.id::text = split_part(coalesce(kunci, ''), '|', 1)
      and k.operator_id = public.my_operator_id()
  )
$$;

-- ---------------------------------------------------------------------
-- 3. BACA KATALOG: HANYA PENYEWA SENDIRI (+ Superadmin/Syahbandar)
-- ---------------------------------------------------------------------
-- `operator_id is null` dipertahankan untuk baris global/legacy yang dibuat
-- Superadmin. Policy tulis di bagian 3b melarang penyewa mengubah/menghapus
-- baris NULL, jadi baris NULL tidak bisa dipakai menyelundupkan data penyewa
-- lain maupun diklaim menjadi milik penyewa.
drop policy if exists baca_staf_kapal on public.kapal;
create policy baca_staf_kapal on public.kapal for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or operator_id = public.my_operator_id()
    or operator_id is null
  );

drop policy if exists baca_staf_jadwal on public.jadwal;
create policy baca_staf_jadwal on public.jadwal for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or public.jadwal_izin(id)
  );

drop policy if exists baca_staf_kursi on public.kursi;
create policy baca_staf_kursi on public.kursi for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or public.jadwal_izin(jadwal_id)
  );

drop policy if exists baca_staf_template on public.template_jadwal;
create policy baca_staf_template on public.template_jadwal for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or operator_id = public.my_operator_id()
    or operator_id is null
  );

drop policy if exists baca_staf_rute on public.master_rute;
create policy baca_staf_rute on public.master_rute for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or operator_id = public.my_operator_id()
    or operator_id is null
  );

drop policy if exists baca_staf_sistem on public.pengaturan_sistem;
create policy baca_staf_sistem on public.pengaturan_sistem for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or operator_id = public.my_operator_id()
    or operator_id is null
  );

-- ---------------------------------------------------------------------
-- 3b. TULIS KATALOG: BARIS GLOBAL HANYA BOLEH DIUBAH SUPERADMIN
-- ---------------------------------------------------------------------
-- Policy tulis tahap 2 memakai `operator_id is null` di USING. Karena trigger
-- fn_isi_operator mengisi operator_id pemanggil saat UPDATE, penyewa bisa
-- mengklaim/menghapus baris global — termasuk baris platform
-- `pengaturan_sistem` yang dipakai Syahbandar. Policy di bawah menghapus
-- kelonggaran itu; baris global tetap bisa DIBACA lewat policy baca di atas.
drop policy if exists tulis_kapal on public.kapal;
create policy tulis_kapal on public.kapal for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id())
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists tulis_template on public.template_jadwal;
create policy tulis_template on public.template_jadwal for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id())
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists tulis_rute on public.master_rute;
create policy tulis_rute on public.master_rute for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id())
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

drop policy if exists tulis_sistem on public.pengaturan_sistem;
create policy tulis_sistem on public.pengaturan_sistem for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id())
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

-- Jadwal: jangan lagi memakai `jadwal_izin()` di USING. Helper itu sengaja
-- menganggap jadwal tanpa operator/kapal sebagai "boleh" untuk data lama;
-- kalau dipakai untuk tulis, penyewa bisa mengklaim jadwal global.
drop policy if exists tulis_jadwal on public.jadwal;
create policy tulis_jadwal on public.jadwal for all to authenticated
  using (public.is_superadmin() or operator_id = public.my_operator_id())
  with check (public.is_superadmin() or operator_id = public.my_operator_id());

-- ---------------------------------------------------------------------
-- 4. KUNCI KURSI: TULIS HANYA UNTUK KAPAL SENDIRI
-- ---------------------------------------------------------------------
-- Policy lama `tulis_staf_kursi_pakai` adalah `for all ... using (true)
-- with check (true)` — siapa pun yang login bisa menghapus kunci kursi
-- penyewa lain. Sekarang dibaca dan ditulis terpisah.
drop policy if exists baca_staf_kursi_pakai on public.kursi_pakai;
create policy baca_staf_kursi_pakai on public.kursi_pakai for select to authenticated
  using (
    public.is_superadmin()
    or public.is_syahbandar()
    or public.kursi_pakai_izin(keberangkatan_key)
  );

drop policy if exists tulis_staf_kursi_pakai on public.kursi_pakai;
create policy tulis_staf_kursi_pakai on public.kursi_pakai for all to authenticated
  using (
    public.is_superadmin()
    or public.kursi_pakai_izin(keberangkatan_key)
  )
  with check (
    public.is_superadmin()
    or public.kursi_pakai_izin(keberangkatan_key)
  );

-- ---------------------------------------------------------------------
-- 5. CEK HASIL
-- ---------------------------------------------------------------------
-- Semua policy baca staf di atas TIDAK BOLEH lagi menampilkan `true` polos.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'kapal', 'jadwal', 'kursi', 'template_jadwal', 'master_rute',
    'pengaturan_sistem', 'kursi_pakai'
  )
order by tablename, policyname;

notify pgrst, 'reload schema';
