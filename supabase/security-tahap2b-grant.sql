-- =====================================================================
-- PENGAMANAN TAHAP 2b — HAK AKSES service_role
-- Jalankan SETELAH security-tahap2.sql.
--
-- Kenapa perlu: skrip tahap 2 mematikan tulis untuk anon, sehingga semua
-- penulisan publik sekarang lewat API server (service role). Di project ini
-- tabel lama hanya diberi GRANT ke anon/authenticated, jadi service_role
-- kena "permission denied for table pesanan" (42501) → API publik gagal 500.
-- Blok ini memberi service_role akses penuh (RLS tetap dilewati oleh
-- service_role, sesuai desain Supabase).
-- Aman dijalankan berulang.
-- =====================================================================

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tabel yang dibuat di masa depan otomatis ikut.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Pastikan service_role memang melewati RLS (default Supabase sudah begitu).
do $$
begin
  begin
    execute 'alter role service_role bypassrls';
  exception when insufficient_privilege then
    raise notice 'Lewati alter role service_role (butuh superuser) — biasanya sudah bypassrls.';
  end;
end $$;

notify pgrst, 'reload schema';
