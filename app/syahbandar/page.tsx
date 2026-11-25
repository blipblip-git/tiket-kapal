'use client'

import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, formatDaftarAbk, logoutOperator } from '@/lib/supabase'
import { beroperasiPada } from '@/lib/hari'
import { kotaTerdekat, RADIUS_DETEKSI_KM } from '@/lib/geo'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  status_boarding: string
  waktu_boarding: string | null
  is_balita: boolean
  grup_transaksi_id: string | null
}

// Satu baris manifest = satu keberangkatan (jam + kapal + rute).
// Dulu hanya jam yang jadi kunci, sehingga dua kapal pada jam yang sama
// tergabung jadi satu dan manifest kapal kedua tidak pernah muncul.
type LaporanPerJam = {
  kunci: string
  jam: string
  total_terjual: number
  rincian: RincianPenumpang[]
  nama_kapal: string
  nama_kapten: string
  nama_abk: string[]
  rute: string
}

type DaerahManifest = {
  asal: string
  tujuan: string[]
}

// Manifest dibaca lewat RPC `publik_manifest_jadwal` (SECURITY DEFINER).
// security-tahap3-publik.sql mencabut hak SELECT tabel pesanan dari anon,
// sehingga query langsung selalu gagal "permission denied for table pesanan"
// dan manifest tampil kosong. RPC ini hanya mengembalikan kolom manifest.
// Sejak portal ini wajib login, RPC dipanggil dengan sesi staf (authenticated),
// dan hak `anon` dicabut lewat supabase/manifest-privat.sql.
// Hasil diambil per 1000 baris (batas maksimum baris PostgREST).
async function ambilManifest(jadwalIds: string[]) {
  const ukuranHalaman = 1000
  const semua: any[] = []
  for (let offset = 0; offset < 20000; offset += ukuranHalaman) {
    const { data, error } = await supabase.rpc('publik_manifest_jadwal', {
      p_jadwal_ids: jadwalIds,
      p_limit: ukuranHalaman,
      p_offset: offset,
    })
    if (error) return { data: semua, error }
    const baris = data || []
    semua.push(...baris)
    if (baris.length < ukuranHalaman) return { data: semua, error: null }
  }
  return { data: semua, error: null }
}

function SyahbandarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasi = searchParams.get('lokasi') || ''
  const tujuan = searchParams.get('tujuan') || ''
  const operatorId = searchParams.get('operator') || ''

  const [loading, setLoading] = useState(true)
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [daftarDaerah, setDaftarDaerah] = useState<DaerahManifest[]>([])
  const [memuatDaerah, setMemuatDaerah] = useState(true)
  const [errorManifest, setErrorManifest] = useState('')
  const [statusLokasi, setStatusLokasi] = useState<'mendeteksi' | 'terdeteksi' | 'manual'>('mendeteksi')
  const sudahDeteksi = useRef(false)
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })
  const [expandedKunci, setExpandedKunci] = useState<string | null>(null)

  // Portal Syahbandar WAJIB login. Profil tidak dipakai untuk menyaring
  // manifest (satu akun berlaku untuk semua daerah), hanya sebagai pintu masuk.
  // Pemeriksaan sesi dilakukan komponen GerbangSesi di bawah.

  // Kartu daerah dibuat OTOMATIS dari semua rute yang ada di sistem (master_rute)
  useEffect(() => {
    async function muatDaerah() {
      const kumpulan: { rute_asal: string; rute_tujuan: string }[] = []

      let qRute = supabase.from('master_rute').select('rute_asal, rute_tujuan')
      if (operatorId) qRute = qRute.eq('operator_id', operatorId)
      const { data: dataRute } = await qRute
      ;(dataRute || []).forEach((r: any) => {
        if (r.rute_asal && r.rute_tujuan) kumpulan.push({ rute_asal: r.rute_asal, rute_tujuan: r.rute_tujuan })
      })

      // Rute dari Manajemen Jadwal (template) — sumber utama untuk penyewa baru,
      // karena form jadwal tidak lagi mengisi master_rute.
      let qTemplate = supabase.from('template_jadwal').select('rute_asal, rute_tujuan')
      if (operatorId) qTemplate = qTemplate.eq('operator_id', operatorId)
      const { data: dataTemplate } = await qTemplate
      ;(dataTemplate || []).forEach((t: any) => {
        if (t.rute_asal && t.rute_tujuan) kumpulan.push({ rute_asal: t.rute_asal, rute_tujuan: t.rute_tujuan })
      })

      // Cadangan: kalau semua sumber di atas kosong, pakai rute yang sudah pernah dipakai di jadwal
      if (kumpulan.length === 0) {
        let qJadwal = supabase.from('jadwal').select('rute_asal, rute_tujuan').limit(1000)
        if (operatorId) qJadwal = qJadwal.eq('operator_id', operatorId)
        const { data: dataJadwal } = await qJadwal
        ;(dataJadwal || []).forEach((j: any) => {
          if (j.rute_asal && j.rute_tujuan) kumpulan.push({ rute_asal: j.rute_asal, rute_tujuan: j.rute_tujuan })
        })
      }

      const grupMap = new Map<string, Set<string>>()
      kumpulan.forEach(r => {
        if (!grupMap.has(r.rute_asal)) grupMap.set(r.rute_asal, new Set())
        grupMap.get(r.rute_asal)!.add(r.rute_tujuan)
      })

      const hasil: DaerahManifest[] = Array.from(grupMap.entries()).map(([asal, tujuanSet]) => ({
        asal,
        tujuan: Array.from(tujuanSet).sort((a, b) => a.localeCompare(b))
      }))

      const posisi = (nama: string) => (nama === 'Tarakan' ? 0 : nama === 'Tanjung Selor' ? 1 : 2)
      hasil.sort((a, b) => {
        const selisih = posisi(a.asal) - posisi(b.asal)
        return selisih !== 0 ? selisih : a.asal.localeCompare(b.asal)
      })

      setDaftarDaerah(hasil)
      setMemuatDaerah(false)
    }
    muatDaerah()
  }, [operatorId])

  // Deteksi lokasi Syahbandar dari GPS, lalu pilih daerah terdekat otomatis.
  // Hanya berjalan sekali dan tidak menimpa pilihan manual (?lokasi=...).
  useEffect(() => {
    if (lokasi || sudahDeteksi.current || daftarDaerah.length === 0) return
    sudahDeteksi.current = true
    terapkanLokasiTerdekat()
    // terapkanLokasiTerdekat sengaja tidak masuk daftar dependensi: efek ini
    // hanya boleh jalan sekali, dijaga oleh ref sudahDeteksi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lokasi, daftarDaerah])

  function terapkanLokasiTerdekat() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatusLokasi('manual')
      return
    }
    setStatusLokasi('mendeteksi')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const daftarNama = daftarDaerah.map((d) => d.asal)
        const kota = kotaTerdekat(pos.coords.latitude, pos.coords.longitude, daftarNama)
        if (!kota || kota.jarak > RADIUS_DETEKSI_KM) {
          setStatusLokasi('manual')
          return
        }
        setStatusLokasi('terdeteksi')
        pilihLokasi(kota.nama)
      },
      () => setStatusLokasi('manual'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  function pilihLokasi(asal: string) {
    const param = new URLSearchParams()
    if (asal) param.set('lokasi', asal)
    if (tujuan) param.set('tujuan', tujuan)
    if (operatorId) param.set('operator', operatorId)
    setExpandedKunci(null)
    router.push(`/syahbandar${param.toString() ? `?${param.toString()}` : ''}`)
  }

  useEffect(() => {
    async function fetchData() {
      // Belum pilih daerah → tampilkan kartu portal dulu, jangan tarik manifest
      if (!lokasi) {
        setLaporan([])
        setLoading(false)
        return
      }

      setLoading(true)

      let queryTemplate = supabase
        .from('template_jadwal')
        .select('jam_berangkat, hari_operasi, rute_tujuan, kapal_id')
        .eq('rute_asal', lokasi)
      let queryJadwal = supabase
        .from('jadwal')
        .select('id, jam_berangkat, rute_asal, rute_tujuan, kapal_id')
        .eq('tanggal', tanggal)
        .eq('rute_asal', lokasi)

      if (tujuan) {
        queryTemplate = queryTemplate.eq('rute_tujuan', tujuan)
        queryJadwal = queryJadwal.eq('rute_tujuan', tujuan)
      }

      if (operatorId) {
        queryTemplate = queryTemplate.eq('operator_id', operatorId)
        queryJadwal = queryJadwal.eq('operator_id', operatorId)
      }

      const { data: templateData, error: errTemplate } = await queryTemplate
      const { data: jadwalData, error: errJadwal } = await queryJadwal

      const daftarJadwal: any[] = jadwalData || []
      const idJadwal: string[] = daftarJadwal.map((j) => j.id).filter(Boolean)

      // Pesanan diambil lewat RPC, bukan filter relasi bersarang: filter
      // `jadwal.tanggal` pada PostgREST tidak benar-benar menyaring baris induk
      // dan hasilnya dibatasi 1000 baris, sehingga manifest sering kosong.
      let pesananData: any[] = []
      let errPesanan: { message: string } | null = null
      if (idJadwal.length > 0) {
        const hasilRpc = await ambilManifest(idJadwal)
        if (hasilRpc.error) {
          // Cadangan: RPC belum dibuat (SQL belum dijalankan). Query langsung
          // hanya berhasil untuk akun yang lolos RLS pesanan (mis. Superadmin);
          // akun syahbandar harus lewat RPC.
          const hasilPesanan = await supabase
            .from('pesanan')
            .select('id, nama_penumpang, status_boarding, waktu_boarding, is_balita, grup_transaksi_id, jadwal_id, kursi:kursi_id (nomor_kursi)')
            .eq('status', 'paid')
            .in('jadwal_id', idJadwal)
          pesananData = hasilPesanan.data || []
          errPesanan = hasilPesanan.error || hasilRpc.error
        } else {
          pesananData = hasilRpc.data
        }
      }

      const kapalIds = [...new Set([
        ...daftarJadwal.map((j) => j.kapal_id),
        ...(templateData || []).map((t: any) => t.kapal_id),
      ].filter(Boolean))] as string[]

      const kapalMap = new Map<string, any>()
      if (kapalIds.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('*').in('id', kapalIds)
        kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
      }

      const pesananPerJadwal = new Map<string, any[]>()
      pesananData.forEach((p) => {
        if (!p.jadwal_id) return
        if (!pesananPerJadwal.has(p.jadwal_id)) pesananPerJadwal.set(p.jadwal_id, [])
        pesananPerJadwal.get(p.jadwal_id)!.push(p)
      })

      // Satu baris manifest per jadwal (jam + kapal + rute). Dua kapal pada jam
      // yang sama kini tampil terpisah, bukan tergabung jadi satu.
      const hasil: LaporanPerJam[] = daftarJadwal.map((j) => {
        const dataKapal = kapalMap.get(j.kapal_id)
        const rincian: RincianPenumpang[] = (pesananPerJadwal.get(j.id) || []).map((p) => ({
          id: p.id,
          nama: p.nama_penumpang,
          kursi: p.kursi?.nomor_kursi || p.nomor_kursi || '-',
          status_boarding: p.status_boarding || 'belum',
          waktu_boarding: p.waktu_boarding || null,
          is_balita: p.is_balita || false,
          grup_transaksi_id: p.grup_transaksi_id || null,
        }))
        return {
          kunci: `jadwal-${j.id}`,
          jam: String(j.jam_berangkat).substring(0, 5),
          total_terjual: rincian.length,
          rincian,
          nama_kapal: dataKapal?.nama || '-',
          nama_kapten: dataKapal?.nama_kapten || '-',
          nama_abk: dataKapal?.nama_abk || [],
          rute: `${j.rute_asal} - ${j.rute_tujuan}`,
        }
      })

      // Jam dari template yang belum punya baris jadwal tetap ditampilkan
      // sebagai jadwal kosong (mis. jadwal hari itu belum digenerate).
      const jadwalSudahAda = new Set(hasil.map((h) => `${h.jam}|${h.rute}`))
      ;(templateData || []).forEach((t: any) => {
        if (!beroperasiPada(tanggal, t.hari_operasi)) return
        const jam = String(t.jam_berangkat).substring(0, 5)
        const rute = `${lokasi} - ${t.rute_tujuan || tujuan || '-'}`
        if (jadwalSudahAda.has(`${jam}|${rute}`)) return
        jadwalSudahAda.add(`${jam}|${rute}`)
        const dataKapal = kapalMap.get(t.kapal_id)
        hasil.push({
          kunci: `template-${jam}-${t.rute_tujuan || '-'}`,
          jam,
          total_terjual: 0,
          rincian: [],
          nama_kapal: dataKapal?.nama || '-',
          nama_kapten: dataKapal?.nama_kapten || '-',
          nama_abk: dataKapal?.nama_abk || [],
          rute,
        })
      })

      hasil.sort((a, b) => a.jam.localeCompare(b.jam) || a.nama_kapal.localeCompare(b.nama_kapal))

      const galat = errJadwal?.message || errPesanan?.message || errTemplate?.message
      if (galat) {
        setErrorManifest(`Gagal memuat manifest: ${galat}`)
      }

      setLaporan(hasil)
      setLoading(false)
    }
    fetchData()
  }, [tanggal, lokasi, tujuan, operatorId])

  const handlePrint = () => { setTimeout(() => window.print(), 100) }
  
  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    const grupMap = new Map<string, RincianPenumpang[]>()
    
    rincian.forEach(p => {
      const key = p.grup_transaksi_id || p.id
      if (!grupMap.has(key)) grupMap.set(key, [])
      grupMap.get(key)!.push(p)
    })

    const grupArray = Array.from(grupMap.values()).map(grup => {
      const dewasa = grup.filter(p => !p.is_balita).sort((a, b) => {
        if (!a.waktu_boarding && !b.waktu_boarding) return 0;
        if (!a.waktu_boarding) return 1;
        if (!b.waktu_boarding) return -1;
        return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
      })
      const balita = grup.filter(p => p.is_balita)
      return [...dewasa, ...balita]
    })

    grupArray.sort((grupA, grupB) => {
      const waktuA = grupA[0]?.waktu_boarding
      const waktuB = grupB[0]?.waktu_boarding
      if (!waktuA && !waktuB) return 0;
      if (!waktuA) return 1;
      if (!waktuB) return -1;
      return new Date(waktuA).getTime() - new Date(waktuB).getTime();
    })

    return grupArray.flat()
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>

  const now = new Date()
  const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  
  const laporanBelumClosed = laporan.filter(l => tanggal === hariIniStr && l.jam > jamSekarang)
  const laporanSudahClosed = laporan.filter(l => tanggal !== hariIniStr || l.jam <= jamSekarang)
  
  // Kunci detail diturunkan dari data terbaru: kalau jadwal yang sedang dibuka
  // hilang (mis. ganti tanggal), panel otomatis kembali ke daftar jadwal.
  const kunciAktif = expandedKunci && laporan.some(l => l.kunci === expandedKunci) ? expandedKunci : null
  const rincianAktif = kunciAktif ? laporan.find(l => l.kunci === kunciAktif) ?? null : null

  const tanggalFormatHeader = new Date(tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  const totalDewasa = rincianAktif ? rincianAktif.rincian.filter(p => !p.is_balita).length : 0;
  const totalBalita = rincianAktif ? rincianAktif.rincian.filter(p => p.is_balita).length : 0;

  const dataUrut = rincianAktif ? urutkanBerdasarkanScan(rincianAktif.rincian) : []
  const barisPerHalaman = 30
  const halamanData: RincianPenumpang[][] = []
  
  for (let i = 0; i < dataUrut.length; i += barisPerHalaman) {
    halamanData.push(dataUrut.slice(i, i + barisPerHalaman))
  }
  // Manifest kosong tetap dicetak satu halaman (header + baris keterangan).
  if (halamanData.length === 0) halamanData.push([])

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
          table { font-size: 11px !important; width: 100%; border-collapse: collapse; }
          th, td { padding: 3px 6px !important; }
          tr { page-break-inside: avoid; }
          .page-break { page-break-after: always; break-after: page; position: relative; min-height: 100vh; box-sizing: border-box; }
          .page-break:last-child { page-break-after: auto; break-after: auto; }
          .nomor-halaman { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 12px; color: #000; }
        }
      `}} />

      <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden print:hidden">
        {!lokasi ? (
          <>
            <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3 md:py-4">
              <div className="max-w-md mx-auto flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">Portal Syahbandar</h1>
                  <p className="text-sm text-gray-600 mt-0.5">Pilih daerah untuk melihat dan mencetak manifest penumpang.</p>
                </div>
                <button onClick={() => logoutOperator()} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
                  &larr; Keluar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-4">
              <div className="max-w-md mx-auto">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <label htmlFor="pilih-daerah" className="block text-xs font-bold text-gray-700 mb-1">
                    Pilih Daerah Syahbandar
                  </label>
                  <select
                    id="pilih-daerah"
                    value=""
                    onChange={(e) => pilihLokasi(e.target.value)}
                    disabled={memuatDaerah || daftarDaerah.length === 0}
                    className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">
                      {memuatDaerah
                        ? 'Memuat daftar daerah...'
                        : daftarDaerah.length === 0
                        ? 'Belum ada rute terdaftar'
                        : '— Pilih daerah —'}
                    </option>
                    {daftarDaerah.map((d) => (
                      <option key={d.asal} value={d.asal}>
                        {d.asal} ({d.tujuan.length} tujuan)
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-gray-500">
                      {statusLokasi === 'mendeteksi'
                        ? 'Mendeteksi lokasi dari GPS...'
                        : statusLokasi === 'terdeteksi'
                        ? 'Daerah dipilih otomatis dari lokasi Anda.'
                        : 'Lokasi terdeteksi tidak tersedia, pilih manual.'}
                    </p>
                    {statusLokasi !== 'mendeteksi' && daftarDaerah.length > 0 && (
                      <button
                        onClick={terapkanLokasiTerdekat}
                        className="text-[11px] text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Deteksi ulang
                      </button>
                    )}
                  </div>
                </div>

                {daftarDaerah.length === 0 && !memuatDaerah && (
                  <div className="bg-white p-4 mt-2 rounded-lg border border-gray-200 text-center shadow-sm">
                    <p className="text-gray-500 text-xs">Belum ada rute terdaftar di sistem.</p>
                  </div>
                )}

                {daftarDaerah.length > 0 && (
                  <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-[11px] font-bold text-gray-700 mb-1.5">Rute tersedia</p>
                    <ul className="text-[11px] text-gray-600 space-y-0.5">
                      {daftarDaerah.map((d) => (
                        <li key={`rute-${d.asal}`}>
                          {d.tujuan.map((t) => `${d.asal} → ${t}`).join(' • ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : !kunciAktif ? (
          <>
            <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3 md:py-4">
              <div className="max-w-md mx-auto">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 leading-tight">Manifest {lokasi}{tujuan ? ` → ${tujuan}` : ''}</h1>
                    <p className="text-sm text-gray-600 mt-0.5">{tanggalFormatHeader}</p>
                  </div>
                  <button onClick={() => router.push(`/syahbandar${operatorId ? `?operator=${encodeURIComponent(operatorId)}` : ''}`)} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
                    &larr; Kembali
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Daerah</label>
                  <select
                    value={lokasi}
                    onChange={(e) => pilihLokasi(e.target.value)}
                    disabled={memuatDaerah}
                    className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">— Pilih daerah —</option>
                    {daftarDaerah.map((d) => (
                      <option key={d.asal} value={d.asal}>{d.asal}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Tanggal</label>
                  <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-4">
              <div className="max-w-md mx-auto space-y-6">
                {errorManifest && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-md px-3 py-2">
                    {errorManifest}
                    {(errorManifest.includes('permission denied') || errorManifest.toLowerCase().includes('could not find the function')) && (
                      <p className="mt-1">
                        Jalankan <code className="font-mono">supabase/manifest-publik.sql</code> lalu{' '}
                        <code className="font-mono">supabase/manifest-privat.sql</code> di Supabase SQL Editor, kemudian muat ulang halaman ini.
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">OPEN SCHEDULE</h2>
                  {laporanBelumClosed.length === 0 ? (
                    <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                      <p className="text-gray-500 text-xs">Belum ada jadwal open.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {laporanBelumClosed.map((l) => (
                        <div key={l.kunci} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                          <button 
                            onClick={() => setExpandedKunci(l.kunci)}
                            className="w-full px-3 py-2 flex justify-between items-center hover:bg-gray-50 transition"
                          >
                            <div className="text-left">
                              <p className="font-bold text-xs text-gray-900">Jam {l.jam}</p>
                              <p className="text-[10px] text-gray-600">{l.nama_kapal}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">{l.total_terjual} Penumpang</span>
                              <span className="text-blue-600 text-[10px]">▶</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">CLOSING SCHEDULE</h2>
                  {laporanSudahClosed.length === 0 ? (
                    <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                      <p className="text-gray-500 text-xs">Belum ada jadwal closing.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {laporanSudahClosed.map((l) => (
                        <div key={l.kunci} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                          <button 
                            onClick={() => setExpandedKunci(l.kunci)} 
                            className="w-full px-3 py-2 flex justify-between items-center hover:bg-gray-50 transition"
                          >
                            <div className="text-left">
                              <p className="font-bold text-xs text-gray-900">Jam {l.jam}</p>
                              <p className="text-[10px] text-gray-600">{l.nama_kapal}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold">{l.total_terjual} Penumpang</span>
                              <span className="text-blue-600 text-[10px]">▶</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3">
              <div className="max-w-md mx-auto flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">Detail Manifest</h1>
                  <p className="text-sm text-gray-600 mt-0.5">Jam {rincianAktif?.jam} - {tanggalFormatHeader}</p>
                </div>
                <button onClick={() => setExpandedKunci(null)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 font-bold">
                  Tutup
                </button>
              </div>
            </div>

            <div className="flex-shrink-0 bg-blue-50 p-4 border-b border-blue-200">
              <div className="max-w-md mx-auto text-[11px] grid grid-cols-[110px_10px_1fr] gap-y-1.5 text-gray-700">
                <span>Tanggal</span><span>:</span><span>{tanggalFormatHeader}</span>
                <span>Rute</span><span>:</span><span>{rincianAktif?.rute || `${lokasi} - -`}</span>
                <span>Kapal</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapal}</span>
                <span className="font-medium">Nama Kapten</span><span>:</span><span>{rincianAktif?.nama_kapten || '-'}</span>
                <span className="font-medium">ABK</span><span>:</span><span className="break-words">{formatDaftarAbk(rincianAktif?.nama_abk)}</span>
                <span className="font-bold">Total Penumpang</span><span className="font-bold">:</span><span className="font-bold">{rincianAktif?.total_terjual} Orang / Dewasa {totalDewasa} Orang + Balita {totalBalita} Orang</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full">
              <div className="max-w-md mx-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 border-b text-center text-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-3 text-[10px] font-bold">No</th>
                      <th className="px-2 py-3 text-[10px] font-bold">Nama / Kursi</th>
                      <th className="px-2 py-3 text-[10px] font-bold">SCAN</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {rincianAktif?.rincian.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-400 italic text-xs">Belum ada penumpang.</td>
                      </tr>
                    ) : (
                      rincianAktif && urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => (
                        <tr key={p.id} className="hover:bg-gray-50 text-center text-gray-900">
                          <td className="px-2 py-3 text-[11px]">{idx + 1}</td>
                          <td className="px-2 py-3 text-[11px] font-bold text-left">
                            {p.nama} / {p.kursi}
                            {p.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
                          </td>
                          <td className="px-2 py-3 text-[10px]">
                            {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
              <div className="max-w-md mx-auto">
                <button onClick={handlePrint} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm transition-colors">
                  📋 Cetak Manifest (PDF)
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {rincianAktif && (
        <div className="hidden print:block w-full">
          {halamanData.map((halaman, pageIdx) => {
            const startNo = pageIdx * barisPerHalaman + 1
            const nomorHalaman = pageIdx + 1

            return (
              <div key={pageIdx} className="page-break">
                <div className="text-center mb-4">
                  <h1 className="text-xl font-bold text-gray-900">LAPORAN MANIFEST PENUMPANG JAM {rincianAktif.jam}</h1>
                </div>
                <div className="mb-4 text-sm grid grid-cols-[160px_10px_1fr] gap-y-1">
                  <span>Tanggal</span><span>:</span><span>{tanggalFormatHeader}</span>
                  <span>Rute</span><span>:</span><span>{rincianAktif.rute || `${lokasi} - ${tujuan || '-'}`}</span>
                  <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
                  <span className="font-medium">Nama Kapten</span><span>:</span><span>{rincianAktif.nama_kapten || '-'}</span>
                  <span className="font-medium">ABK</span><span>:</span><span className="break-words">{formatDaftarAbk(rincianAktif.nama_abk)}</span>
                  <span className="font-bold">Total Penumpang</span><span className="font-bold">:</span><span className="font-bold">{rincianAktif.total_terjual} Orang / Dewasa {totalDewasa} Orang + Balita {totalBalita} Orang</span>
                </div>

                <table className="w-full text-sm border-collapse border border-gray-400">
                  <thead>
                    <tr className="bg-gray-200 text-center text-gray-900">
                      <th className="border border-gray-400 px-2 py-2 text-center" style={{ width: '40px' }}>NO</th>
                      <th className="border border-gray-400 px-2 py-2 text-center">NAMA / KURSI</th>
                      <th className="border border-gray-400 px-2 py-2 text-center" style={{ width: '80px' }}>SCAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {halaman.length === 0 && (
                      <tr>
                        <td colSpan={3} className="border border-gray-400 px-2 py-2 text-center text-gray-600">
                          Belum ada penumpang pada jam ini.
                        </td>
                      </tr>
                    )}
                    {halaman.map((p, idx) => (
                      <tr key={p.id} className="text-gray-900 text-center">
                        <td className="border border-gray-400 px-2 py-1 text-center">{startNo + idx}</td>
                        <td className="border border-gray-400 px-2 py-1 font-bold text-left">
                          {p.nama} / {p.kursi}
                          {p.is_balita && <span className="text-xs ml-1">(Balita)</span>}
                        </td>
                        <td className="border border-gray-400 px-2 py-1 text-center">
                          {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="nomor-halaman">
                  Halaman {nomorHalaman} dari {halamanData.length}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// Gerbang login /syahbandar.
// Dulu portal ini terbuka untuk siapa saja yang tahu URL-nya, sehingga nama,
// kursi, dan status boarding penumpang bisa dibaca tanpa akun. Sekarang isi
// manifest hanya dirender setelah ada sesi Supabase Auth (hasil /login).
function GerbangSesi({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [siap, setSiap] = useState(false)

  useEffect(() => {
    let batal = false

    supabase.auth.getSession().then(({ data }) => {
      if (batal) return
      if (data.session) {
        setSiap(true)
        return
      }
      // Tanpa sesi: kembali ke halaman login dengan pesan yang jelas.
      router.replace('/login?pesan=session_expired')
    })

    return () => {
      batal = true
    }
  }, [router])

  if (!siap) {
    return <p className="p-6 text-center text-gray-600">Memeriksa sesi...</p>
  }

  return <>{children}</>
}

export default function SyahbandarPage() {
  return (
    <GerbangSesi>
      <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
        <SyahbandarContent />
      </Suspense>
    </GerbangSesi>
  )
}