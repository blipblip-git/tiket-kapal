'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  supabase,
  getProfile,
  ambilNamaPerusahaan,
  formatDaftarAbk,
  catatAudit,
  type Profile
} from '@/lib/supabase'

// Supabase membatasi maksimal 1000 baris per permintaan → wajib ambil bertahap.
const UKURAN_HALAMAN = 1000
// Maksimal jumlah id dalam satu filter .in() supaya URL tidak kepanjangan.
const UKURAN_CAMPUR = 100

// Satu "tenant" = satu Admin Utama beserta seluruh datanya.
type Tenant = { operatorId: string; nama: string }

const DAFTAR_LEMBAR = [
  { nama: 'Info Backup', isi: 'Identitas tenant + jumlah baris tiap data' },
  { nama: 'Kapal', isi: 'Armada kapal, kapten, dan ABK' },
  { nama: 'Template Jadwal', isi: 'Jadwal rutin (rute, jam, harga, hari operasi)' },
  { nama: 'Jadwal', isi: 'Jadwal per tanggal beserta harga & status' },
  { nama: 'Penjualan', isi: 'Semua tiket/penumpang (termasuk balita & fee)' },
  { nama: 'Pembayaran', isi: 'Transaksi pembayaran tiket' },
  { nama: 'Petugas & Agen', isi: 'Akun staf perusahaan (tanpa password)' },
  { nama: 'Master Rute', isi: 'Rute & harga default' }
]

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = []
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran))
  return hasil
}

/** Ambil SEMUA baris dari satu tabel (dipanggil berulang per 1000 baris). */
async function ambilSemua(buatQuery: () => any): Promise<any[]> {
  const semua: any[] = []
  for (let mulai = 0; ; mulai += UKURAN_HALAMAN) {
    const { data, error } = await buatQuery().range(mulai, mulai + UKURAN_HALAMAN - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    semua.push(...data)
    if (data.length < UKURAN_HALAMAN) break
  }
  return semua
}

/**
 * Ambil template_jadwal / jadwal milik satu operator.
 * Data lama bisa belum punya operator_id, jadi pemiliknya ditentukan dari kapal.
 */
async function ambilMilikOperator(tabel: string, operatorId: string, kapalIds: string[]): Promise<any[]> {
  const hasil = new Map<string, any>()

  const langsung = await ambilSemua(() =>
    supabase.from(tabel).select('*').eq('operator_id', operatorId)
  )
  langsung.forEach((baris: any) => hasil.set(baris.id, baris))

  for (const bagian of potong(kapalIds, UKURAN_CAMPUR)) {
    const lewatKapal = await ambilSemua(() =>
      supabase.from(tabel).select('*').is('operator_id', null).in('kapal_id', bagian)
    )
    lewatKapal.forEach((baris: any) => hasil.set(baris.id, baris))
  }

  return [...hasil.values()]
}

/** Ambil baris tabel anak (pesanan / pembayaran) berdasarkan daftar id induknya. */
async function ambilBerdasarkanId(
  tabel: string,
  kolom: string,
  ids: string[],
  urut?: string
): Promise<any[]> {
  const hasil = new Map<string, any>()
  for (const bagian of potong(ids, UKURAN_CAMPUR)) {
    const baris = await ambilSemua(() => {
      const q = supabase.from(tabel).select('*').in(kolom, bagian)
      return urut ? q.order(urut) : q
    })
    baris.forEach((b: any) => hasil.set(b.id, b))
  }
  return [...hasil.values()]
}

/** Lembar Excel + lebar kolom otomatis. */
function buatLembar(baris: Record<string, unknown>[]): XLSX.WorkSheet {
  const lembar = XLSX.utils.json_to_sheet(baris)
  const kunci = baris.length > 0 ? Object.keys(baris[0]) : []
  lembar['!cols'] = kunci.map((k) => {
    const terpanjang = baris
      .slice(0, 100)
      .reduce((maks, b) => Math.max(maks, String(b[k] ?? '').length), k.length)
    return { wch: Math.min(45, Math.max(12, terpanjang + 2)) }
  })
  return lembar
}

/** Ambil seluruh data satu tenant (kapal s/d master rute). */
async function ambilDataTenant(operatorId: string, lapor?: (pesan: string) => void) {
  lapor?.('Mengambil data kapal...')
  const kapal = await ambilSemua(() =>
    supabase.from('kapal').select('*').eq('operator_id', operatorId).order('nama')
  )
  const kapalIds: string[] = kapal.map((k: any) => k.id)

  lapor?.('Mengambil template jadwal & jadwal...')
  const template = await ambilMilikOperator('template_jadwal', operatorId, kapalIds)
  const jadwal = await ambilMilikOperator('jadwal', operatorId, kapalIds)
  jadwal.sort((a: any, b: any) =>
    `${a.tanggal || ''} ${a.jam_berangkat || ''}`.localeCompare(`${b.tanggal || ''} ${b.jam_berangkat || ''}`)
  )
  const jadwalIds: string[] = jadwal.map((j: any) => j.id)

  lapor?.(`Mengambil data penjualan (${jadwalIds.length} jadwal)...`)
  const pesanan = await ambilBerdasarkanId('pesanan', 'jadwal_id', jadwalIds, 'jam_transaksi')
  const pesananIds: string[] = pesanan.map((p: any) => p.id)

  lapor?.(`Mengambil data pembayaran (${pesananIds.length} tiket)...`)
  const pembayaran = await ambilBerdasarkanId('pembayaran', 'pesanan_id', pesananIds, 'waktu_bayar')

  lapor?.('Mengambil data petugas, agen & master rute...')
  // Password (password_plain / password_hash) TIDAK pernah ikut diekspor.
  const staf = await ambilSemua(() =>
    supabase
      .from('profiles')
      .select('id, nama, email, nomor_hp, role, lokasi, unit, fee, aktif, created_at')
      .eq('operator_id', operatorId)
      .order('nama')
  )
  const masterRute = await ambilSemua(() =>
    supabase
      .from('master_rute')
      .select('*')
      .or(`operator_id.eq.${operatorId},operator_id.is.null`)
  )

  return { operatorId, kapal, template, jadwal, pesanan, pembayaran, staf, masterRute }
}

type DataTenant = Awaited<ReturnType<typeof ambilDataTenant>>

type BarisExcel = {
  Kapal: Record<string, unknown>[]
  'Template Jadwal': Record<string, unknown>[]
  Jadwal: Record<string, unknown>[]
  Penjualan: Record<string, unknown>[]
  Pembayaran: Record<string, unknown>[]
  'Petugas & Agen': Record<string, unknown>[]
  'Master Rute': Record<string, unknown>[]
}

/**
 * Ubah data mentah menjadi baris Excel siap tulis.
 * `kolomPerusahaan` = true dipakai saat backup SEMUA tenant sekaligus,
 * supaya tiap baris jelas milik perusahaan mana.
 */
function buatBarisExcel(data: DataTenant, namaPerusahaan: string, kolomPerusahaan: boolean): BarisExcel {
  const tambah = (baris: Record<string, unknown>): Record<string, unknown> =>
    kolomPerusahaan ? { Perusahaan: namaPerusahaan, ...baris } : baris

  const petaKapal = new Map(data.kapal.map((k: any) => [k.id, k]))
  const petaJadwal = new Map(data.jadwal.map((j: any) => [j.id, j]))
  const petaPesanan = new Map(data.pesanan.map((p: any) => [p.id, p]))

  const kapal = data.kapal.map((k: any) =>
    tambah({
      'ID Kapal': k.id,
      'Nama Kapal': k.nama ?? '',
      Kapasitas: k.kapasitas ?? '',
      'Layout Kursi': k.layout_kursi ?? '',
      Status: k.status ?? '',
      'Nama Kapten': k.nama_kapten ?? '',
      ABK: formatDaftarAbk(k.nama_abk),
      Catatan: k.catatan ?? ''
    })
  )

  const template = data.template.map((t: any) =>
    tambah({
      'ID Template': t.id,
      Kapal: petaKapal.get(t.kapal_id)?.nama || '',
      'Rute Asal': t.rute_asal ?? '',
      'Rute Tujuan': t.rute_tujuan ?? '',
      'Jam Berangkat': t.jam_berangkat ?? '',
      Harga: t.harga ?? 0,
      Kapasitas: t.kapasitas ?? '',
      'Hari Operasi': Array.isArray(t.hari_operasi) ? t.hari_operasi.join(', ') : '',
      Aktif: t.aktif ? 'Ya' : 'Tidak'
    })
  )

  const jadwal = data.jadwal.map((j: any) =>
    tambah({
      'ID Jadwal': j.id,
      Tanggal: j.tanggal ?? '',
      'Jam Berangkat': j.jam_berangkat ?? '',
      'Rute Asal': j.rute_asal ?? '',
      'Rute Tujuan': j.rute_tujuan ?? '',
      Kapal: petaKapal.get(j.kapal_id)?.nama || '',
      Harga: j.harga ?? 0,
      'Status Jadwal': j.status_jadwal ?? '',
      'Petugas Closing': j.petugas_closing ?? ''
    })
  )

  const penjualan = data.pesanan.map((p: any) => {
    const j: any = petaJadwal.get(p.jadwal_id)
    return tambah({
      'Kode Tiket': p.kode_tiket ?? '',
      'Nama Penumpang': p.nama_penumpang ?? '',
      NIK: p.nik ?? '',
      'No HP': p.nomor_hp ?? '',
      Rute: j ? `${j.rute_asal || ''} - ${j.rute_tujuan || ''}` : '',
      Tanggal: j?.tanggal ?? '',
      Jam: j?.jam_berangkat ?? '',
      Kapal: j ? petaKapal.get(j.kapal_id)?.nama || '' : '',
      'Harga Tiket': j?.harga ?? 0,
      Kanal: p.kanal ?? '',
      Status: p.status ?? '',
      Balita: p.is_balita ? 'Ya' : 'Tidak',
      'Induk (Tiket Orang Tua)': p.induk_id ?? '',
      'Jam Transaksi': p.jam_transaksi ?? '',
      'Waktu Bayar': p.waktu_bayar ?? '',
      'Petugas Jual': p.petugas_jual ?? '',
      'Fee Agen': p.fee_agen ?? 0,
      'Fee Platform': p.fee_platform ?? 0
    })
  })

  const pembayaran = data.pembayaran.map((b: any) => {
    const p: any = petaPesanan.get(b.pesanan_id)
    return tambah({
      'ID Pembayaran': b.id,
      'Kode Tiket': p?.kode_tiket ?? '',
      'Nama Penumpang': p?.nama_penumpang ?? '',
      Metode: b.metode ?? '',
      Jumlah: b.jumlah ?? 0,
      Status: b.status ?? '',
      Referensi: b.referensi ?? '',
      'Waktu Bayar': b.waktu_bayar ?? ''
    })
  })

  const staf = data.staf.map((s: any) =>
    tambah({
      Nama: s.nama ?? '',
      Email: s.email ?? '',
      'No HP': s.nomor_hp ?? '',
      Role: s.role ?? '',
      Lokasi: s.lokasi ?? '',
      Unit: s.unit ?? '',
      'Fee per Tiket': s.fee ?? 0,
      Aktif: s.aktif ? 'Ya' : 'Tidak',
      Dibuat: s.created_at ?? ''
    })
  )

  const rute = data.masterRute.map((r: any) =>
    tambah({
      'Rute Asal': r.rute_asal ?? '',
      'Rute Tujuan': r.rute_tujuan ?? '',
      Harga: r.harga ?? 0,
      Milik: r.operator_id ? 'Perusahaan' : 'Global'
    })
  )

  return {
    Kapal: kapal,
    'Template Jadwal': template,
    Jadwal: jadwal,
    Penjualan: penjualan,
    Pembayaran: pembayaran,
    'Petugas & Agen': staf,
    'Master Rute': rute
  }
}

/** Susun + unduh workbook dari daftar sheet. */
function unduhExcel(namaFile: string, info: Record<string, unknown>[], baris: BarisExcel) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, buatLembar(info), 'Info Backup')
  Object.entries(baris).forEach(([nama, isi]) => {
    XLSX.utils.book_append_sheet(workbook, buatLembar(isi), nama)
  })
  XLSX.writeFile(workbook, namaFile)
}

function namaAman(teks: string): string {
  return (teks || 'Penyewa').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function BackupDataPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [daftarTenant, setDaftarTenant] = useState<Tenant[]>([])
  const [pilihTenant, setPilihTenant] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [proses, setProses] = useState(false)
  const [langkah, setLangkah] = useState('')
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')

  const superadmin = profile?.role === 'superadmin'
  const operatorSendiri = profile ? profile.operator_id || profile.id : ''

  useEffect(() => {
    mulai()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function mulai() {
    try {
      const profil = await getProfile()
      if (!profil) {
        router.push('/login')
        return
      }
      setProfile(profil)

      if (profil.role === 'superadmin') {
        // Superadmin: daftar tenant = semua akun Admin Utama yang terdaftar.
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nama, nama_perusahaan, operator_id')
          .eq('role', 'admin_utama')
          .order('nama')
        if (error) throw new Error(error.message)

        const tenants: Tenant[] = (data || []).map((t: any) => ({
          operatorId: t.operator_id || t.id,
          nama: t.nama_perusahaan || t.nama || 'Penyewa'
        }))
        setDaftarTenant(tenants)
        if (tenants.length === 1) setPilihTenant(tenants[0].operatorId)
        setNamaPerusahaan('Superadmin')
      } else if (profil.role === 'admin_utama') {
        setNamaPerusahaan(await ambilNamaPerusahaan(profil))
      } else {
        setGalat('Halaman ini khusus Admin Utama dan Superadmin.')
      }
    } catch (err: any) {
      setGalat(err?.message || 'Gagal memuat data sesi.')
    } finally {
      setMemuat(false)
    }
  }

  function pilihTarget(): Tenant | null {
    if (!profile) return null
    if (superadmin) return daftarTenant.find((t) => t.operatorId === pilihTenant) || null
    return { operatorId: operatorSendiri, nama: namaPerusahaan || profile.nama }
  }

  async function backupSatu() {
    const target = pilihTarget()
    if (!target) {
      setGalat('Pilih tenant yang mau dibackup dulu.')
      return
    }
    await jalankan([target])
  }

  async function backupSemuaTenant() {
    if (daftarTenant.length === 0) {
      setGalat('Belum ada tenant terdaftar.')
      return
    }
    await jalankan(daftarTenant)
  }

  async function jalankan(daftar: Tenant[]) {
    if (!profile) return
    setProses(true)
    setGalat('')
    setPesan('')

    try {
      const gabung = daftar.length > 1
      const tanggal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' })
      const isiInfo: Record<string, unknown>[] = []
      const kumpulan: BarisExcel = {
        Kapal: [],
        'Template Jadwal': [],
        Jadwal: [],
        Penjualan: [],
        Pembayaran: [],
        'Petugas & Agen': [],
        'Master Rute': []
      }

      for (let i = 0; i < daftar.length; i++) {
        const tenant = daftar[i]
        const awalan = gabung ? `(${i + 1}/${daftar.length}) ${tenant.nama} — ` : ''
        const data = await ambilDataTenant(tenant.operatorId, (p) => setLangkah(awalan + p))
        const baris = buatBarisExcel(data, tenant.nama, gabung)

        if (gabung) {
          ;(Object.keys(kumpulan) as (keyof BarisExcel)[]).forEach((k) => {
            kumpulan[k].push(...baris[k])
          })
        } else {
          Object.assign(kumpulan, baris)
        }

        isiInfo.push({
          Perusahaan: tenant.nama,
          'ID Operator': tenant.operatorId,
          'Jumlah Kapal': data.kapal.length,
          'Jumlah Template Jadwal': data.template.length,
          'Jumlah Jadwal': data.jadwal.length,
          'Jumlah Penjualan': data.pesanan.length,
          'Jumlah Pembayaran': data.pembayaran.length,
          'Jumlah Petugas/Agen': data.staf.length,
          'Jumlah Master Rute': data.masterRute.length
        })
      }

      const ringkas = gabung ? `SEMUA TENANT (${daftar.length} perusahaan)` : daftar[0].nama
      const infoAwal: Record<string, unknown>[] = [
        { Keterangan: 'Cakupan Backup', Nilai: ringkas },
        { Keterangan: 'Dibuat', Nilai: `${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA` },
        { Keterangan: 'Dibuat Oleh', Nilai: `${profile.nama || '-'} (${profile.role})` },
        {
          Keterangan: 'Catatan',
          Nilai: gabung
            ? 'Backup SEMUA tenant dalam satu file. Tiap baris punya kolom Perusahaan. Password staf tidak diekspor.'
            : 'Seluruh data perusahaan ini. Password staf tidak diekspor.'
        }
      ]

      setLangkah('Menyusun file Excel...')
      const namaFile = gabung
        ? `Backup-SEMUA-TENANT-${tanggal}.xlsx`
        : `Backup-${namaAman(daftar[0].nama)}-${tanggal}.xlsx`
      unduhExcel(namaFile, [...infoAwal, { Keterangan: '', Nilai: '' }, ...isiInfo], kumpulan)

      const jumlah = (kunci: keyof BarisExcel) => kumpulan[kunci].length
      await catatAudit(profile, 'backup_data', {
        file: namaFile,
        tenant: ringkas,
        jumlah_tenant: daftar.length,
        kapal: jumlah('Kapal'),
        jadwal: jumlah('Jadwal'),
        penjualan: jumlah('Penjualan'),
        pembayaran: jumlah('Pembayaran'),
        master_rute: jumlah('Master Rute')
      })

      setPesan(`Berhasil! File ${namaFile} sudah diunduh (cek folder Download).`)
    } catch (err: any) {
      setGalat('Gagal membuat backup: ' + (err?.message || 'kesalahan tidak diketahui'))
    } finally {
      setProses(false)
      setLangkah('')
    }
  }

  if (memuat) {
    return (
      <div className="min-h-[100dvh] bg-gray-100 flex items-center justify-center">
        <p className="text-sm text-gray-500">Memuat data...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-[100dvh] bg-gray-100 p-4 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-md w-full space-y-3 text-center">
          <p className="text-red-600 text-sm font-medium">{galat || 'Sesi tidak ditemukan.'}</p>
          <button onClick={() => router.push('/login')} className="w-full bg-gray-700 text-white py-2 rounded text-sm font-medium">
            Ke Halaman Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gray-100 p-3 md:p-6">
      <div className="max-w-4xl mx-auto space-y-3 md:space-y-4">
        <div className="flex items-start justify-between gap-2 bg-white rounded-xl shadow-md p-4 md:p-5 border border-gray-200">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900">Backup Data (Excel)</h1>
            <p className="text-xs md:text-sm text-gray-600">
              {superadmin ? 'Superadmin — bisa backup per tenant atau semua tenant' : namaPerusahaan || profile.nama}
            </p>
          </div>
          <button
            onClick={() => router.push(superadmin ? '/dashboard-superadmin' : '/dashboard')}
            className="bg-gray-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded hover:bg-gray-700 text-[10px] md:text-sm font-medium shrink-0"
          >
            Kembali
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 md:p-6 border border-gray-200 space-y-4">
          <p className="text-sm md:text-base text-gray-800">
            Sekali klik, semua data {superadmin ? 'tenant yang dipilih' : 'perusahaan Anda'} diunduh jadi
            <strong> satu file Excel (.xlsx)</strong> berisi {DAFTAR_LEMBAR.length} sheet.
          </p>

          {superadmin ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs md:text-sm font-medium text-gray-700">Pilih tenant (perusahaan)</label>
                <select
                  value={pilihTenant}
                  onChange={(e) => setPilihTenant(e.target.value)}
                  disabled={proses}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm md:text-base bg-white"
                >
                  <option value="">— Pilih tenant —</option>
                  {daftarTenant.map((t) => (
                    <option key={t.operatorId} value={t.operatorId}>{t.nama}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={backupSatu}
                disabled={proses || !pilihTenant}
                className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm md:text-base"
              >
                {proses ? 'Sedang Membuat Backup...' : 'Unduh Backup Tenant Terpilih'}
              </button>

              <div className="border-t border-gray-200 pt-3 space-y-2">
                <button
                  onClick={backupSemuaTenant}
                  disabled={proses || daftarTenant.length === 0}
                  className="w-full bg-emerald-700 text-white font-bold py-3 rounded-lg hover:bg-emerald-800 disabled:bg-gray-400 text-sm md:text-base"
                >
                  {proses ? 'Sedang Membuat Backup...' : `Unduh Backup SEMUA Tenant (${daftarTenant.length}) — 1 File`}
                </button>
                <p className="text-[11px] md:text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  {daftarTenant.length === 0
                    ? 'Belum ada tenant (Admin Utama) yang terdaftar.'
                    : 'Semua tenant digabung dalam 1 file, tiap baris diberi kolom Perusahaan. Kalau datanya sudah sangat banyak, proses ini bisa lama — lebih nyaman di PC.'}
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={backupSatu}
              disabled={proses}
              className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm md:text-base"
            >
              {proses ? 'Sedang Membuat Backup...' : 'Unduh Backup Excel (Semua Data)'}
            </button>
          )}

          {langkah && <p className="text-xs md:text-sm text-blue-700 font-medium">{langkah}</p>}
          {pesan && <p className="text-xs md:text-sm text-green-700 font-medium">{pesan}</p>}
          {galat && <p className="text-xs md:text-sm text-red-600 font-medium">{galat}</p>}

          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs md:text-sm font-bold text-gray-900 mb-2">Isi file Excel:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {DAFTAR_LEMBAR.map((l) => (
                <div key={l.nama} className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-xs md:text-sm font-bold text-gray-900">{l.nama}</p>
                  <p className="text-[11px] md:text-xs text-gray-600">{l.isi}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] md:text-xs text-gray-500">
            Catatan: password petugas/agen tidak pernah ikut diekspor. Setiap backup tercatat di Audit Log.
            Simpan file di tempat aman (HP/PC) karena file ini berisi data penumpang.
          </p>
        </div>
      </div>
    </div>
  )
}

