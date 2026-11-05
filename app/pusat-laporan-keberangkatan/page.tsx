'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

function LaporanOperatorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    async function fetchLaporan() {
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
          id, nama_penumpang, kode_tiket, kanal, status, status_boarding, waktu_boarding,
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
          id: item.id, nama: item.nama_penumpang, kursi: item.kursi?.nomor_kursi || '-', kanal: item.kanal || 'loket', kode_tiket: item.kode_tiket, harga: item.jadwal.harga || 0, status_boarding: item.status_boarding || 'belum', waktu_boarding: item.waktu_boarding || null, nama_kapal: group.nama_kapal, nama_kapten: group.nama_kapten, rute: `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`
        })
      })
      setLaporan(Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam)))
    }
    fetchLaporan()
  }, [profile, tanggal])

  const handlePrint = () => {
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center items-center">
      <div className="bg-white p-8 rounded shadow max-w-md text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Akses Ditolak</h2>
        <p className="text-gray-700 mb-6">{error}</p>
        <button onClick={() => router.push('/dashboard/loket-menu')} className="bg-blue-600 text-white px-4 py-2 rounded">Kembali</button>
      </div>
    </div>
  )
  if (!profile) return null

  let labelRole = profile.role === 'admin_utama' ? 'Admin Utama' : 'Operator Keberangkatan'
  const ruteLengkap = `${profile.lokasi} - ${profile.lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}`
  const now = new Date()
  const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  const laporanBelumClosed = laporan.filter(l => tanggal === hariIniStr && l.jam >= jamSekarang && ((parseInt(l.jam.split(':')[0])*60 + parseInt(l.jam.split(':')[1])) - (parseInt(jamSekarang.split(':')[0])*60 + parseInt(jamSekarang.split(':')[1]))) <= 60)
  const laporanSudahClosed = laporan.filter(l => tanggal !== hariIniStr || l.jam < jamSekarang)
  
  const rincianAktif = expandedJam ? laporanSudahClosed.find(l => l.jam === expandedJam) : null

  // FUNGSI UNTUK MENGURUTKAN BERDASARKAN WAKTU SCAN
  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    return [...rincian].sort((a, b) => {
      // Kalau dua-duanya belum scan, biarkan urutan aslinya
      if (!a.waktu_boarding && !b.waktu_boarding) return 0;
      // Yang belum scan ditaruh paling bawah
      if (!a.waktu_boarding) return 1;
      if (!b.waktu_boarding) return -1;
      // Kalau dua-duanya sudah scan, urutkan dari waktu paling awal
      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
    });
  }

  const potongKode = (kode: string) => kode.length > 6 ? `...${kode.slice(-6)}` : kode

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; margin: 15mm; }
          .print-hidden { display: none !important; }
        }
      `}} />

      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded shadow-sm border border-gray-200 print-hidden">
          <h1 className="text-xl font-bold text-gray-900">Laporan {labelRole} {profile.lokasi} - {profile.nama}</h1>
          <button onClick={() => router.push('/dashboard/keberangkatan')} className="text-sm text-blue-600 hover:underline">&larr; Kembali</button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex items-center gap-4 print-hidden">
          <label className="text-sm font-medium text-gray-700">Pilih Tanggal:</label>
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-3 py-1 text-gray-900" />
        </div>

        {/* MANIFEST */}
        <>
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2 print-hidden">Jadwal Belum Closing</h2>
            {laporanBelumClosed.length === 0 ? (
              <p className="text-gray-500 bg-white p-4 rounded shadow text-sm print-hidden">Belum ada jadwal.</p>
            ) : (
              <div className="space-y-4 print-hidden">
                {laporanBelumClosed.map((l) => (
                  <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                    <div className="bg-blue-50 px-4 py-3 border-b flex justify-between items-center">
                      <span className="font-bold text-gray-900">🕒 Jadwal Jam {l.jam}</span>
                      <span className="text-sm font-bold text-blue-600">{l.total_terjual} Penumpang</span>
                    </div>
                    <div className="p-2">
                      {l.rincian.map((p, idx) => (
                        <div key={p.id} className="text-sm p-1 text-gray-900 font-medium">
                          {idx + 1}. {p.nama} / {p.kursi} ({potongKode(p.kode_tiket)})
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2 print-hidden">Jadwal Sudah Closing</h2>
            {laporanSudahClosed.length === 0 ? (
              <p className="text-gray-500 bg-white p-4 rounded shadow text-sm print-hidden">Belum ada jadwal.</p>
            ) : (
              <div className="space-y-2 print-hidden">
                {laporanSudahClosed.map((l) => (
                  <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                    <button onClick={() => setExpandedJam(expandedJam === l.jam ? null : l.jam)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition">
                      <span className="font-bold text-gray-900">📋 Manifest Jam {l.jam}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-blue-600">{l.total_terjual} Penumpang</span>
                        <span className="text-blue-600">{expandedJam === l.jam ? '▲' : '▼'}</span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PRINT: MANIFEST */}
          {rincianAktif && (
            <div className="hidden print:block mt-8">
              <h1 className="text-xl font-bold text-center mb-6">LAPORAN MANIFEST PENUMPANG JAM {rincianAktif.jam}</h1>
              
              <div className="mb-4 text-sm grid grid-cols-[200px_10px_1fr] gap-y-1">
                <span>Tanggal</span><span>:</span><span>{tanggal}</span>
                <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
                <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
                <span>Kapten</span><span>:</span><span>{rincianAktif.nama_kapten}</span>
                <span className="whitespace-nowrap">Jumlah Penumpang</span><span>:</span><span className="font-bold">{rincianAktif.total_terjual} Orang</span>
              </div>
              
              <table className="w-full text-sm border-collapse border border-gray-400">
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
                      <td className="border border-gray-400 px-2 py-1 font-bold">{p.nama} / {p.kursi}</td>
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

          {/* LAYAR: MANIFEST RINCIAN */}
          {expandedJam && rincianAktif && (
            <div className="mt-8 print-hidden">
              <div className="bg-white rounded shadow border-2 border-blue-400 overflow-hidden">
                <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                  <h3 className="font-bold text-lg">Rincian Manifest Jam {expandedJam}</h3>
                  <div className="flex gap-2">
                    <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-green-700">📋 Cetak Manifest</button>
                    <button onClick={() => setExpandedJam(null)} className="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-700">Tutup</button>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-b text-sm grid grid-cols-[200px_10px_1fr] gap-y-1 text-gray-800">
                  <span>Tanggal</span><span>:</span><span>{tanggal}</span>
                  <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
                  <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
                  <span>Kapten</span><span>:</span><span className="font-bold">{rincianAktif.nama_kapten}</span>
                  <span className="whitespace-nowrap">Jumlah Penumpang</span><span>:</span><span className="font-bold">{rincianAktif.total_terjual} Orang</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-200 border-b text-center text-gray-900">
                      <tr>
                        <th className="px-4 py-3 border">No</th>
                        <th className="px-4 py-3 border">Nama / Kursi</th>
                        <th className="px-4 py-3 border">Waktu Scan</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rincianAktif.rincian.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500 italic">
                            Belum ada penumpang yang terdaftar di jam ini.
                          </td>
                        </tr>
                      ) : (
                        urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => (
                          <tr key={p.id} className="hover:bg-gray-50 text-center text-gray-900">
                            <td className="px-4 py-3 text-sm">{idx + 1}</td>
                            <td className="px-4 py-3 text-sm font-bold">{p.nama} / {p.kursi}</td>
                            <td className="px-4 py-3 text-sm">
                              {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  )
}

export default function LaporanOperatorPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <LaporanOperatorContent />
    </Suspense>
  )
}