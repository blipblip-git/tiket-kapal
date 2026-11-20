'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, formatDaftarAbk, type Profile } from '@/lib/supabase'
import { beroperasiPada } from '@/lib/hari'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  status_boarding: string
  waktu_boarding: string | null
  is_balita: boolean
  grup_transaksi_id: string | null
}

type LaporanPerJam = {
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

// Warna kartu daerah (diputar otomatis sesuai urutan rute)
const WARNA_KARTU = [
  { kartu: 'bg-blue-50 border-blue-200 hover:bg-blue-100', judul: 'text-blue-900', panah: 'text-blue-700' },
  { kartu: 'bg-green-50 border-green-200 hover:bg-green-100', judul: 'text-green-900', panah: 'text-green-700' },
  { kartu: 'bg-purple-50 border-purple-200 hover:bg-purple-100', judul: 'text-purple-900', panah: 'text-purple-700' },
  { kartu: 'bg-orange-50 border-orange-200 hover:bg-orange-100', judul: 'text-orange-900', panah: 'text-orange-700' },
  { kartu: 'bg-teal-50 border-teal-200 hover:bg-teal-100', judul: 'text-teal-900', panah: 'text-teal-700' },
  { kartu: 'bg-rose-50 border-rose-200 hover:bg-rose-100', judul: 'text-rose-900', panah: 'text-rose-700' },
]

function SyahbandarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasi = searchParams.get('lokasi') || ''
  const tujuan = searchParams.get('tujuan') || ''
  const operatorId = searchParams.get('operator') || ''

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [daftarDaerah, setDaftarDaerah] = useState<DaerahManifest[]>([])
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })
  const [expandedJam, setExpandedJam] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      
      if (p) {
        setProfile(p)
      }
      setLoading(false)
    }
    init()
  }, [router])

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
    }
    muatDaerah()
  }, [operatorId])

  useEffect(() => {
    async function fetchData() {
      // Belum pilih daerah → tampilkan kartu portal dulu, jangan tarik manifest
      if (!lokasi) {
        setLaporan([])
        setLoading(false)
        return
      }

      setLoading(true)

      let queryTemplate = supabase.from('template_jadwal').select('jam_berangkat, hari_operasi').eq('rute_asal', lokasi)
      let queryJadwal = supabase.from('jadwal').select('id, jam_berangkat, rute_asal, rute_tujuan, kapal_id').eq('tanggal', tanggal).eq('rute_asal', lokasi)
      let queryPesanan = supabase.from('pesanan').select(`
          id, nama_penumpang, status_boarding, waktu_boarding, is_balita, grup_transaksi_id,
          jadwal:jadwal_id (jam_berangkat, rute_asal, rute_tujuan, kapal_id, operator_id),
          kursi:kursi_id (nomor_kursi)
        `).eq('status', 'paid').eq('jadwal.tanggal', tanggal).eq('jadwal.rute_asal', lokasi)

      if (tujuan) {
        queryJadwal = queryJadwal.eq('rute_tujuan', tujuan)
        queryPesanan = queryPesanan.eq('jadwal.rute_tujuan', tujuan)
      }

      if (operatorId) {
        queryTemplate = queryTemplate.eq('operator_id', operatorId)
        queryJadwal = queryJadwal.eq('operator_id', operatorId)
        queryPesanan = queryPesanan.eq('jadwal.operator_id', operatorId)
      }

      const { data: templateData } = await queryTemplate
      const { data: jadwalData } = await queryJadwal
      const { data: pesananData } = await queryPesanan
      
      const kapalIdsFromJadwal = [...new Set(jadwalData?.map((j: any) => j.kapal_id).filter(Boolean) || [])]
      let kapalMap = new Map()
      if (kapalIdsFromJadwal.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('*').in('id', kapalIdsFromJadwal)
        kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
      }

      const filtered = (pesananData || []).filter((item: any) => item.jadwal !== null)

      const jamSet = new Set<string>()
      if (templateData) templateData.forEach((t: any) => {
        if (!beroperasiPada(tanggal, t.hari_operasi)) return
        jamSet.add(t.jam_berangkat.substring(0, 5))
      })

      const groupedByJam: { [key: string]: LaporanPerJam } = {}
      jamSet.forEach(jam => {
        const jadwalCocok = jadwalData?.find((j: any) => j.jam_berangkat.substring(0, 5) === jam)
        const dataKapal = jadwalCocok ? kapalMap.get(jadwalCocok.kapal_id) : null
        groupedByJam[jam] = { 
          jam, total_terjual: 0, rincian: [], 
          nama_kapal: dataKapal?.nama || '-', 
          nama_kapten: dataKapal?.nama_kapten || '-',
          nama_abk: dataKapal?.nama_abk || [],
          rute: jadwalCocok ? `${jadwalCocok.rute_asal} - ${jadwalCocok.rute_tujuan}` : `${lokasi} - ${tujuan || '-'}`
        }
      })

      filtered.forEach((item: any) => {
        const jam = item.jadwal.jam_berangkat.substring(0, 5)
        if (!groupedByJam[jam]) groupedByJam[jam] = {
          jam, total_terjual: 0, rincian: [],
          nama_kapal: '-', nama_kapten: '-', nama_abk: [],
          rute: `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`
        }
        const group = groupedByJam[jam]
        group.total_terjual += 1
        group.rincian.push({
          id: item.id, 
          nama: item.nama_penumpang, 
          kursi: item.kursi?.nomor_kursi || '-', 
          status_boarding: item.status_boarding || 'belum',
          waktu_boarding: item.waktu_boarding || null,
          is_balita: item.is_balita || false,
          grup_transaksi_id: item.grup_transaksi_id || null
        })
      })

      setLaporan(Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam)))
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
  
  const rincianAktif = expandedJam ? laporan.find(l => l.jam === expandedJam) : null

  const tanggalFormatHeader = new Date(tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  const totalDewasa = rincianAktif ? rincianAktif.rincian.filter(p => !p.is_balita).length : 0;
  const totalBalita = rincianAktif ? rincianAktif.rincian.filter(p => p.is_balita).length : 0;

  const dataUrut = rincianAktif ? urutkanBerdasarkanScan(rincianAktif.rincian) : []
  const barisPerHalaman = 30
  const halamanData: RincianPenumpang[][] = []
  
  for (let i = 0; i < dataUrut.length; i += barisPerHalaman) {
    halamanData.push(dataUrut.slice(i, i + barisPerHalaman))
  }

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
                <button onClick={() => router.push('/login')} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
                  &larr; Keluar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-4">
              <div className="max-w-md mx-auto space-y-2">
                {daftarDaerah.length === 0 ? (
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                    <p className="text-gray-500 text-xs">Belum ada rute terdaftar di sistem.</p>
                  </div>
                ) : (
                  daftarDaerah.map((d, idx) => {
                    const warna = WARNA_KARTU[idx % WARNA_KARTU.length]
                    const paramOperator = operatorId ? `&operator=${encodeURIComponent(operatorId)}` : ''
                    return (
                      <button
                        key={d.asal}
                        onClick={() => router.push(`/syahbandar?lokasi=${encodeURIComponent(d.asal)}${paramOperator}`)}
                        className={`w-full text-left rounded-lg border shadow-sm px-4 py-3 transition flex justify-between items-center ${warna.kartu}`}
                      >
                        <div className="min-w-0">
                          <p className={`font-bold text-sm ${warna.judul}`}>Manifest {d.asal}</p>
                          <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                            {d.tujuan.map(t => `${d.asal} → ${t}`).join(' • ')}
                          </p>
                        </div>
                        <span className={`text-lg font-bold ml-3 ${warna.panah}`}>&rarr;</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </>
        ) : !expandedJam ? (
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
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Tanggal</label>
                  <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-4">
              <div className="max-w-md mx-auto space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">OPEN SCHEDULE</h2>
                  {laporanBelumClosed.length === 0 ? (
                    <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                      <p className="text-gray-500 text-xs">Belum ada jadwal open.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {laporanBelumClosed.map((l) => (
                        <div key={l.jam} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                          <button 
                            onClick={() => setExpandedJam(l.jam)}
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
                        <div key={l.jam} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                          <button 
                            onClick={() => setExpandedJam(l.jam)} 
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
                  <p className="text-sm text-gray-600 mt-0.5">Jam {expandedJam} - {tanggalFormatHeader}</p>
                </div>
                <button onClick={() => setExpandedJam(null)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 font-bold">
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
                  <h1 className="text-xl font-bold text-gray-900">LAPORAN MANIFEST PENUMPANG JAM {expandedJam}</h1>
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
                  {nomorHalaman}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function SyahbandarPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <SyahbandarContent />
    </Suspense>
  )
}