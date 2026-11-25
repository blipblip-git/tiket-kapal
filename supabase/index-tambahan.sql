-- Index tambahan untuk query yang paling sering dipakai aplikasi.
--
-- Jalankan SEKALI di Supabase SQL Editor (aman diulang: semuanya `if not exists`).
-- Tujuan: saat kapal & pesanan bertambah banyak, laporan/pencarian tetap cepat
-- dan tidak menghabiskan CPU/kuota database.
--
-- Catatan penting: `pesanan` TIDAK punya kolom operator_id (pemilik data dibaca
-- lewat `jadwal.operator_id`), jadi index multi-tenant di bawah memakai kolom
-- yang benar-benar ada. Setiap index memperlambat INSERT sedikit, jadi daftar ini
-- sengaja dibatasi pada pola filter yang benar-benar dipakai di kode.
--
-- Index yang SUDAH ada (jangan dibuat ulang): idx_profiles_auth_user,
-- idx_profiles_operator, idx_kapal_operator, idx_jadwal_operator,
-- idx_pesanan_jadwal, idx_pesanan_status_waktu, idx_kursi_jadwal,
-- idx_kursi_pakai_key, idx_kursi_pakai_pesanan, idx_audit_log_operator_waktu,
-- unique_jadwal_kapal_tanggal_jam_rute.

-- ============================================================================
-- pesanan
-- ============================================================================

-- /etiket, /cek-tiket, dan halaman scan mencari tiket dengan kode.
create index if not exists idx_pesanan_kode_tiket
  on public.pesanan (kode_tiket);

-- Batas tiket pending per nomor HP + pencarian riwayat pembeli di loket.
create index if not exists idx_pesanan_nomor_hp
  on public.pesanan (nomor_hp);

-- Satu transaksi banyak penumpang (grup_transaksi_id dipakai untuk rekap & bayar).
create index if not exists idx_pesanan_grup_transaksi
  on public.pesanan (grup_transaksi_id);

-- Relasi ke kursi: join PostgREST `kursi:kursi_id(nomor_kursi)` di laporan fee
-- dan saat kursi dikosongkan ketika pesanan batal/kedaluwarsa.
create index if not exists idx_pesanan_kursi
  on public.pesanan (kursi_id);

-- Tiket balita menempel ke tiket induk (induk_id).
create index if not exists idx_pesanan_induk
  on public.pesanan (induk_id);

-- ============================================================================
-- jadwal
-- ============================================================================

-- Pencarian tiket publik: tanggal + rute asal + status aktif (lib/jadwalHarian.ts).
create index if not exists idx_jadwal_tanggal_rute_status
  on public.jadwal (tanggal, rute_asal, status);

-- Laporan operator: filter operator + rentang tanggal (laporan bulanan, fee, rekap).
create index if not exists idx_jadwal_operator_tanggal
  on public.jadwal (operator_id, tanggal);

-- ============================================================================
-- kursi & pembayaran
-- ============================================================================

-- Menghitung kursi kosong/terisi per jadwal (halaman pilih kursi & siapkan-jadwal).
create index if not exists idx_kursi_jadwal_status
  on public.kursi (jadwal_id, status);

-- Laporan kasir / fee mengambil pembayaran per pesanan, dan per rentang waktu.
create index if not exists idx_pembayaran_pesanan
  on public.pembayaran (pesanan_id);
create index if not exists idx_pembayaran_waktu
  on public.pembayaran (waktu_bayar);

-- ============================================================================
-- Segarkan statistik supaya query planner langsung memakai index baru.
-- ============================================================================
analyze public.pesanan;
analyze public.jadwal;
analyze public.kursi;
analyze public.pembayaran;
