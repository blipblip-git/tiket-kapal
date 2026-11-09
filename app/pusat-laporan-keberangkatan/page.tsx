'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, type Profile } from '@/lib/supabase'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  kanal: string
  kode_tiket: string
  harga: number
  status_boarding: string
  waktu_boarding: string | null
  nama_kapal: string
  nama_kapten: string
  rute: string
  is_balita: boolean
}

type LaporanPerJam = {
  jam: string
  total_terjual: number
  total_pendapatan: number
  rincian: RincianPenumpang[]
  nama_kapal: string
  nama_kapten: string
  status_jadwal: string
}

function PusatLaporanContent() {
  const router = useRouter()
  
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [mode, setMode] = useState<'menu' | 'manifest'>('menu')

  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [tanggal, setTanggal] = useState('')
  const [expandedJam, setExpandedJam] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) {
        const adminProfile = await getProfile()
        if (adminProfile && adminProfile.role === 'admin_utama') currentProfile = adminProfile
      }
      if (!currentProfile) { router.push('/login'); return }
      if (currentProfile.role !== 'terminal_keberangkatan' && currentProfile.role !== 'admin_utama') {
        setError('Akses Ditolak: Anda tidak memiliki wewenang untuk melihat Laporan ini.')
        setLoading(false); return
      }
      setProfile(currentProfile)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0]
    setTanggal(localDate)
  }, [])

  useEffect(() => {
    if (mode === 'manifest' && profile && tanggal) {
      fetchManifest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile, tanggal])

  async function fetchManifest() {
    if (!profile || !tanggal) return
    const { data: templateData } = await supabase.from('template_jadwal').select('jam_berangkat').eq('rute_asal', profile.lokasi)
    
    const { data: jadwalData } = await supabase.from('jadwal').select('id, jam_berangkat, kapal_id').eq('tanggal', tanggal).eq('rute_asal', profile.lokasi)
    const kapalIdsFromJadwal = [...new Set(jadwalData?.map((j: any) => j.kapal_id).filter(Boolean) || [])]
    
    let kapalMap = new Map()
    if (kapalIdsFromJadwal.length > 0) {
      const { data: kapalData } = await supabase.from('kapal').select('id, nama, nama_kapten').in('id', kapalIdsFromJadwal)
      kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
    }

    const { data, error } = await supabase.from('pesanan').select(`
        id, nama_penumpang, kode_tiket, kanal, status, status_boarding, waktu_boarding, is_balita,
        jadwal:jadwal_id (rute_asal, rute_tujuan, harga, tanggal, jam_berangkat, status_jadwal, kapal_id),
        kursi:kursi_id (nomor_kursi)
      `).eq('status', 'paid').eq('jadwal.tanggal', tanggal)

    if (error) { setError('Gagal memuat laporan: ' + error.message); return }

    const filtered = (data || []).filter((item: any) => {
      if (!item.jadwal) return false;
      if (profile.role === 'admin_utama') return true;
      return item.jadwal.rute_asal === profile.lokasi;
    })

    const jamSet = new Set<string>()
    if (templateData) templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))
    
    const groupedByJam: { [key: string]: LaporanPerJam } = {}
    
    jamSet.forEach(jam => {
      const jadwalCocok = jadwalData?.find((j: any) => j.jam_berangkat.substring(0, 5) === jam)
      const dataKapal = jadwalCocok ? kapalMap.get(jadwalCocok.kapal_id) : null
      
      groupedByJam[jam] = { 
        jam, total_terjual: 0, total_pendapatan: 0, rincian: [], 
        nama_kapal: dataKapal?.nama || '-', 
        nama_kapten: dataKapal?.nama_kapten || '-',
        status_jadwal: 'open'
      }
    })

    filtered.forEach((item: any) => {
      const jam = item.jadwal.jam_berangkat.substring(0, 5)
      if (!groupedByJam[jam]) groupedByJam[jam] = { jam, total_terjual: 0, total_pendapatan: 0, rincian: [], nama_kapal: '-', nama_kapten: '-', status_jadwal: 'open' }
      
      const group = groupedByJam[jam]
      group.total_terjual += 1
      group.total_pendapatan += item.jadwal.harga || 0
      
      group.rincian.push({
        id: item.id, nama: item.nama_penumpang, kursi: item.kursi?.nomor_kursi || '-', kanal: item.kanal || 'loket', kode_tiket: item.kode_tiket, harga: item.jadwal.harga || 0, status_boarding: item.status_boarding || 'belum', waktu_boarding: item.waktu_boarding || null, nama_kapal: group.nama_kapal, nama_kapten: group.nama_kapten, rute: `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`, is_balita: item.is_balita || false
      })
    })
    setLaporan(Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam)))
  }

  const handlePrint = () => {
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return (
    <div className="h-[100dvh] bg-gray-100 flex justify-center items-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Akses Ditolak</h2>
        <p className="text-gray-700 mb-6">{error}</p>
        <button onClick={() => router.push('/dashboard/keberangkatan')} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">Kembali</button>
      </div>
    </div>
  )
  if (!profile) return null

  const ruteLengkap = `${profile.lokasi} - ${profile.lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}`
  const now = new Date()
  const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  const laporanBelumClosed = laporan.filter(l => tanggal === hariIniStr && l.jam >= jamSekarang && ((parseInt(l.jam.split(':')[0])*60 + parseInt(l.jam.split(':')[1])) - (parseInt(jamSekarang.split(':')[0])*60 + parseInt(jamSekarang.split(':')[1]))) <= 60)
  const laporanSudahClosed = laporan.filter(l => tanggal !== hariIniStr || l.jam < jamSekarang)
  
  const rincianAktif = expandedJam ? laporanSudahClosed.find(l => l.jam === expandedJam) : null

  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    return [...rincian].sort((a, b) => {
      if (!a.waktu_boarding && !b.waktu_boarding) return 0;
      if (!a.waktu_boarding) return 1;
      if (!b.waktu_boarding) return -1;
      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
    });
  }

  const potongKode = (kode: string) => kode.length > 6 ? kode.slice(-6) : kode

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0 !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 15mm !important;
            box-sizing: border-box;
            background: white;
          }
          .screen-only { display: none !important; }
        }
      `}} />

      <div className="screen-only h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden">
        
        {mode === 'menu' && (
          <div className="max-w-md w-full mx-auto p-4 flex-1 flex flex-col">
            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4 flex-shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">
                    Pusat Laporan Petugas
                  </h1>
                  <p className="text-sm text-gray-600 mt-1 font-medium">
                    {profile.lokasi} - {profile.nama}
                  </p>
                </div>
                <button 
                  onClick={() => router.push('/dashboard/keberangkatan')} 
                  className="text-xs bg-gray-50 text-blue-600 px-3 py-1.5 rounded hover:underline border border-gray-200 font-bold shadow-sm"
                >
                  &larr; Kembali
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 justify-center pb-4">
              <button 
                onClick={() => router.push('/laporan-penjualan-keberangkatan')} 
                className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
              >
                <div className="text-3xl bg-blue-50 w-14 h-14 flex items-center justify-center rounded-lg">💰</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Laporan Penjualan</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Rekap uang tunai & QRIS yang Anda jual.</p>
                </div>
              </button>

              <button 
                onClick={() => setMode('manifest')} 
                className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
              >
                <div className="text-3xl bg-orange-50 w-14 h-14 flex items-center justify-center rounded-lg">📋</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Laporan Manifest</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Cetak daftar penumpang untuk Syahbandar.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {mode === 'manifest' && (
          <>
            {!expandedJam ? (
              <>
                <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3 md:py-4">
                  <div className="max-w-md mx-auto">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">Laporan Manifest</h1>
                        <p className="text-sm text-gray-600 mt-0.5">Petugas {profile.lokasi} - {profile.nama}</p>
                      </div>
                      <button onClick={() => setMode('menu')} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
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
                      <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">Jadwal Belum Closing</h2>
                      {laporanBelumClosed.length === 0 ? (
                        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                          <p className="text-gray-500 text-xs">Belum ada jadwal.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {laporanBelumClosed.map((l) => (
                            <div key={l.jam} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                              <div className="bg-blue-50 px-3 py-2 flex justify-between items-center">
                                <span className="font-bold text-xs text-gray-900">🕒 Jam {l.jam}</span>
                                <span className="text-xs font-bold text-blue-600">{l.total_terjual} Penumpang</span>
                              </div>
                              <div className="p-2">
                                {l.rincian.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 italic text-center py-1">Belum ada penumpang.</p>
                                ) : (
                                  l.rincian.map((p, idx) => (
                                    <div key={p.id} className="text-[11px] p-1 text-gray-800 border-b border-gray-100 last:border-0">
                                      {idx + 1}. {p.nama} / {p.kursi} <span className="text-gray-500">({potongKode(p.kode_tiket)})</span>
                                      {p.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">Jadwal Sudah Closing</h2>
                      {laporanSudahClosed.length === 0 ? (
                        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                          <p className="text-gray-500 text-xs">Belum ada jadwal.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {laporanSudahClosed.map((l) => (
                            <div key={l.jam} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                              <button 
                                onClick={() => setExpandedJam(l.jam)} 
                                className="w-full px-3 py-2.5 flex justify-between items-center hover:bg-gray-50 transition"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">📋</span>
                                  <span className="font-bold text-xs text-gray-900">Manifest Jam {l.jam}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{l.total_terjual} Penumpang</span>
                                  <span className="text-[10px] text-blue-600">▼</span>
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
                      <h1 className="text-xl font-bold text-gray-900 leading-tight">Rincian Manifest</h1>
                      <p className="text-sm text-gray-600 mt-0.5">Jam {expandedJam}</p>
                    </div>
                    <button onClick={() => setExpandedJam(null)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 font-bold">
                      Tutup
                    </button>
                  </div>
                </div>

                <div className="flex-shrink-0 bg-blue-50 p-4 border-b border-blue-200">
                  <div className="max-w-md mx-auto text-[11px] grid grid-cols-[80px_10px_1fr] gap-y-1 text-gray-700">
                    <span>Tanggal</span><span>:</span><span>{tanggal}</span>
                    <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
                    <span>Kapal</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapal}</span>
                    <span>Kapten</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapten}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto w-full">
                  <div className="max-w-md mx-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100 border-b text-center text-gray-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-3 text-[10px] font-bold">No</th>
                          <th className="px-2 py-3 text-[10px] font-bold">Nama / Kursi</th>
                          <th className="px-2 py-3 text-[10px] font-bold">Scan</th>
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
          </>
        )}
      </div>

      {rincianAktif && (
        <div className="print-container" style={{ display: 'none' }}>
          <style>{`
            @media print {
              .print-container { display: block !important; }
            }
          `}</style>
          <h1 className="text-lg font-bold text-center mb-4">LAPORAN MANIFEST PENUMPANG JAM {rincianAktif.jam}</h1>
          
          <div className="mb-4 text-xs grid grid-cols-[120px_10px_1fr] gap-y-1">
            <span>Tanggal</span><span>:</span><span>{tanggal}</span>
            <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
            <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
            <span>Kapten</span><span>:</span><span>{rincianAktif.nama_kapten}</span>
            <span className="whitespace-nowrap">Jumlah Penumpang</span><span>:</span><span className="font-bold">{rincianAktif.total_terjual} Orang</span>
          </div>
          
          <table className="w-full text-xs border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                <th className="border border-gray-400 px-2 py-1">NAMA / KURSI</th>
                <th className="border border-gray-400 px-2 py-1">WAKTU SCAN</th>
              </tr>
            </thead>
            <tbody>
              {urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => (
                <tr key={p.id} className="text-gray-900 text-center">
                  <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                  <td className="border border-gray-400 px-2 py-1 font-bold text-left">
                    {p.nama} / {p.kursi}
                    {p.is_balita && <span className="text-xs text-orange-600 ml-1">(Balita)</span>}
                  </td>
                  <td className="border border-gray-400 px-2 py-1">
                    {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">TOTAL PENUMPANG</td>
                <td className="border border-gray-400 px-2 py-1 text-center">{rincianAktif.total_terjual}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function PusatLaporanPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <PusatLaporanContent />
    </Suspense>
  )
}