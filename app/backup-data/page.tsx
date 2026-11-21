'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  supabase,
  getProfile,
  getOperatorSession,
  ambilNamaPerusahaan,
  formatDaftarAbk,
  catatAudit,
  type Profile
} from '@/lib/supabase'
import { idOperator } from '@/lib/tenant'

// Supabase membatasi maksimal 1000 baris per permintaan → wajib ambil bertahap.
const UKURAN_HALAMAN = 1000
// Maksimal jumlah id dalam satu filter .in() supaya URL tidak kepanjangan.
const UKURAN_CAMPUR = 100

type Hitungan = { label: string; jumlah: number }

const DAFTAR_LEMBAR = [
  { nama: 'Info Backup', isi: 'Identitas perusahaan + jumlah baris tiap data' },
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
 * Ambil template_jadwal / jadwal milik operator.
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

export default function BackupDataPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sedangProses, setSedangProses] = useState(false)
  const [langkah, setLangkah] = useState('')
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)
  const [hasil, setHasil] = useState<{ file: string; hitungan: Hitungan[] } | null>(null)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) {
        router.push('/login')
        return
      }
      // Backup sengaja HANYA untuk pemilik/penyewa (Admin Utama).
      // Superadmin tidak boleh mengunduh data semua penyewa sekaligus di sini.
      if (p.role !== 'admin_utama') {
        setError('Halaman backup hanya untuk akun Admin Utama (pemilik/penyewa).')
        setLoading(false)
        return
      }
      setProfile(p)
      setNamaPerusahaan(await ambilNamaPerusahaan(p))
      setLoading(false)
    }
    init()
  }, [router])

  async function prosesBackup() {
    if (!profile) return
    setSedangProses(true)
    setPesan(null)
    setHasil(null)

    try {
      const operatorId = idOperator(profile)
      if (!operatorId) throw new Error('ID perusahaan tidak ditemukan. Login ulang lalu coba lagi.')

      setLangkah('Mengambil data kapal...')
      const kapal = await ambilSemua(() =>
        supabase.from('kapal').select('*').eq('operator_id', operatorId).order('nama')
      )
      const kapalIds: string[] = kapal.map((k: any) => k.id)

      setLangkah('Mengambil template jadwal & jadwal...')
      const template = await ambilMilikOperator('template_jadwal', operatorId, kapalIds)
      const jadwal = await ambilMilikOperator('jadwal', operatorId, kapalIds)
      jadwal.sort((a: any, b: any) =>
        `${a.tanggal || ''} ${a.jam_berangkat || ''}`.localeCompare(`${b.tanggal || ''} ${b.jam_berangkat || ''}`)
      )
      const jadwalIds: string[] = jadwal.map((j: any) => j.id)

      setLangkah(`Mengambil data penjualan (${jadwalIds.length} jadwal)...`)
      const pesanan = await ambilBerdasarkanId('pesanan', 'jadwal_id', jadwalIds, 'jam_transaksi')
      const pesananIds: string[] = pesanan.map((p: any) => p.id)

      setLangkah(`Mengambil data pembayaran (${pesananIds.length} tiket)...`)
      const pembayaran = await ambilBerdasarkanId('pembayaran', 'pesanan_id', pesananIds, 'waktu_bayar')

      setLangkah('Mengambil data petugas, agen & master rute...')
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

      const petaKapal = new Map(kapal.map((k: any) => [k.id, k]))
      const petaJadwal = new Map(jadwal.map((j: any) => [j.id, j]))
      const petaPesanan = new Map(pesanan.map((p: any) => [p.id, p]))

      const barisKapal = kapal.map((k: any) => ({
        'ID Kapal': k.id,
        'Nama Kapal': k.nama ?? '',
        Kapasitas: k.kapasitas ?? '',
        'Layout Kursi': k.layout_kursi ?? '',
        Status: k.status ?? '',
        'Nama Kapten': k.nama_kapten ?? '',
        ABK: formatDaftarAbk(k.nama_abk),
        Catatan: k.catatan ?? ''
      }))

      const barisTemplate = template.map((t: any) => ({
        'ID Template': t.id,
        Kapal: petaKapal.get(t.kapal_id)?.nama || '',
        'Rute Asal': t.rute_asal ?? '',
        'Rute Tujuan': t.rute_tujuan ?? '',
        'Jam Berangkat': t.jam_berangkat ?? '',
        Harga: t.harga ?? 0,
        Kapasitas: t.kapasitas ?? '',
        'Hari Operasi': Array.isArray(t.hari_operasi) ? t.hari_operasi.join(', ') : '',
        Aktif: t.aktif ? 'Ya' : 'Tidak'
      }))

      const barisJadwal = jadwal.map((j: any) => ({
        'ID Jadwal': j.id,
        Tanggal: j.tanggal ?? '',
        'Jam Berangkat': j.jam_berangkat ?? '',
        'Rute Asal': j.rute_asal ?? '',
        'Rute Tujuan': j.rute_tujuan ?? '',
        Kapal: petaKapal.get(j.kapal_id)?.nama || '',
        Harga: j.harga ?? 0,
        'Status Jadwal': j.status_jadwal ?? '',
        'Petugas Closing': j.petugas_closing ?? ''
      }))

      const barisPesanan = pesanan.map((p: any) => {
        const j: any = petaJadwal.get(p.jadwal_id)
        return {
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
        }
      })

      const barisPembayaran = pembayaran.map((b: any) => {
        const p: any = petaPesanan.get(b.pesanan_id)
        return {
          'ID Pembayaran': b.id,
          'Kode Tiket': p?.kode_tiket ?? '',
          'Nama Penumpang': p?.nama_penumpang ?? '',
          Metode: b.metode ?? '',
          Jumlah: b.jumlah ?? 0,
          Status: b.status ?? '',
          Referensi: b.referensi ?? '',
          'Waktu Bayar': b.waktu_bayar ?? ''
        }
      })

      const barisStaf = staf.map((s: any) => ({
        Nama: s.nama ?? '',
        Email: s.email ?? '',
        'No HP': s.nomor_hp ?? '',
        Role: s.role ?? '',
        Lokasi: s.lokasi ?? '',
        Unit: s.unit ?? '',
        'Fee per Tiket': s.fee ?? 0,
        Aktif: s.aktif ? 'Ya' : 'Tidak',
        Dibuat: s.created_at ?? ''
      }))

      const barisRute = masterRute.map((r: any) => ({
        'Rute Asal': r.rute_asal ?? '',
        'Rute Tujuan': r.rute_tujuan ?? '',
        Harga: r.harga ?? 0,
        Milik: r.operator_id ? 'Perusahaan' : 'Global'
      }))

      const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })
      const info = [
        { Keterangan: 'Perusahaan', Isi: namaPerusahaan || profile.nama_perusahaan || profile.nama },
        { Keterangan: 'ID Operator (tenant)', Isi: operatorId },
        { Keterangan: 'Dibuat', Isi: `${waktu} WITA` },
        { Keterangan: 'Jumlah Kapal', Isi: kapal.length },
        { Keterangan: 'Jumlah Template Jadwal', Isi: template.length },
        { Keterangan: 'Jumlah Jadwal', Isi: jadwal.length },
        { Keterangan: 'Jumlah Penjualan (tiket)', Isi: pesanan.length },
        { Keterangan: 'Jumlah Pembayaran', Isi: pembayaran.length },
        { Keterangan: 'Jumlah Petugas & Agen', Isi: staf.length },
        { Keterangan: 'Jumlah Master Rute', Isi: masterRute.length },
        { Keterangan: 'Catatan', Isi: 'Satu file berisi semua sheet. Data milik perusahaan ini saja.' }
      ]

      setLangkah('Menyusun file Excel...')
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, buatLembar(info), 'Info Backup')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisKapal), 'Kapal')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisTemplate), 'Template Jadwal')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisJadwal), 'Jadwal')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisPesanan), 'Penjualan')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisPembayaran), 'Pembayaran')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisStaf), 'Petugas & Agen')
      XLSX.utils.book_append_sheet(workbook, buatLembar(barisRute), 'Master Rute')

      const perusahaan = (namaPerusahaan || profile.nama || 'Penyewa').replace(/[^A-Za-z0-9]+/g, '-')
      const tanggalFile = new Date().toISOString().slice(0, 10)
      const namaFile = `Backup-${perusahaan}-${tanggalFile}.xlsx`

      XLSX.writeFile(workbook, namaFile)

      await catatAudit(profile, 'backup_data', {
        file: namaFile,
        kapal: kapal.length,
        jadwal: jadwal.length,
        penjualan: pesanan.length,
        pembayaran: pembayaran.length
      })

      setHasil({
        file: namaFile,
        hitungan: [
          { label: 'Kapal', jumlah: kapal.length },
          { label: 'Template Jadwal', jumlah: template.length },
          { label: 'Jadwal', jumlah: jadwal.length },
          { label: 'Penjualan (tiket)', jumlah: pesanan.length },
          { label: 'Pembayaran', jumlah: pembayaran.length },
          { label: 'Petugas & Agen', jumlah: staf.length },
          { label: 'Master Rute', jumlah: masterRute.length }
        ]
      })
      setPesan({ tipe: 'ok', teks: `File ${namaFile} berhasil diunduh. Cek folder Unduhan/Download.` })
    } catch (err: any) {
      setPesan({ tipe: 'err', teks: 'Gagal membuat backup: ' + (err?.message || 'tidak diketahui') })
    } finally {
      setLangkah('')
      setSedangProses(false)
    }
  }

  if (loading) return <p className="p-6 text-gray-900 font-bold">Memuat...</p>
  if (error) return <p className="p-6 text-red-600 font-bold">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-[100dvh] bg-gray-100 p-3 md:p-6">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        <div className="flex items-start justify-between gap-2 bg-white rounded-xl shadow-md p-4 md:p-5 border border-gray-200">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-gray-900">Backup Data (Excel)</h1>
            <p className="text-xs md:text-sm text-gray-600">{namaPerusahaan || profile.nama}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-gray-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded hover:bg-gray-700 text-[10px] md:text-sm font-medium"
          >
            ← Kembali
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 md:p-6 border border-gray-200 space-y-4">
          <p className="text-sm md:text-base text-gray-800">
            <b>Sekali klik = semua data</b> perusahaan ini diunduh menjadi <b>1 file Excel</b> berisi
            beberapa sheet. Tidak perlu unduh satu per satu. Data penyewa lain tidak ikut.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {DAFTAR_LEMBAR.map((l) => (
              <div key={l.nama} className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                <p className="text-xs md:text-sm font-bold text-gray-900">{l.nama}</p>
                <p className="text-[11px] md:text-xs text-gray-600">{l.isi}</p>
              </div>
            ))}
          </div>

          <button
            onClick={prosesBackup}
            disabled={sedangProses}
            className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm md:text-base"
          >
            {sedangProses ? 'Sedang menyiapkan...' : '⬇️ Unduh Backup Excel (Semua Data)'}
          </button>

          {langkah && <p className="text-xs md:text-sm text-blue-700 font-medium">{langkah}</p>}

          {pesan && (
            <p className={`text-xs md:text-sm font-medium ${pesan.tipe === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
              {pesan.teks}
            </p>
          )}

          {hasil && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3">
              <p className="text-xs md:text-sm font-bold text-green-900">Isi file {hasil.file}</p>
              <ul className="mt-1 space-y-0.5">
                {hasil.hitungan.map((h) => (
                  <li key={h.label} className="text-[11px] md:text-sm text-green-900">
                    • {h.label}: {h.jumlah.toLocaleString('id-ID')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] md:text-xs text-gray-500">
            Catatan: password petugas/agen tidak pernah ikut diekspor. Simpan file backup di tempat aman
            karena berisi data penumpang (nama, NIK, nomor HP).
          </p>
        </div>
      </div>
    </div>
  )
}

