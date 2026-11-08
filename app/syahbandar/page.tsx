'use client'

import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  kanal: string
  kode_tiket: string
  waktu_boarding: string | null
}

type LaporanPerJam = {
  jam: string
  total_terjual: number
  rincian: RincianPenumpang[]
  nama_kapal: string
  nama_kapten: string
}

function SyahbandarContent() {
  const [loading, setLoading] = useState(true)
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })
  const [lokasi, setLokasi] = useState('Tarakan')
  const [expandedJam, setExpandedJam] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: templateData } = await supabase.from('template_jadwal').select('jam_berangkat').eq('rute_asal', lokasi)

      const { data: jadwalData } = await supabase.from('jadwal').select('id, jam_berangkat, kapal_id').eq('tanggal', tanggal).eq('rute_asal', lokasi)
      const kapalIdsFromJadwal = [...new Set(jadwalData?.map((j: any) => j.kapal_id).filter(Boolean) || [])]
      
      let kapalMap = new Map()
      if (kapalIdsFromJadwal.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('id, nama, nama_kapten').in('id', kapalIdsFromJadwal)
        kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
      }

      const { data: pesananData } = await supabase.from('pesanan').select(`
          id, nama_penumpang, kode_tiket, kanal, waktu_boarding,
          jadwal:jadwal_id (jam_berangkat, rute_asal, kapal_id),
          kursi:kursi_id (nomor_kursi)
        `).eq('status', 'paid').eq('jadwal.tanggal', tanggal).eq('jadwal.rute_asal', lokasi)

      const filtered = (pesananData || []).filter((item: any) => item.jadwal !== null)

      const jamSet = new Set<string>()
      if (templateData) templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))
      for (let i = 7; i <= 16; i++) jamSet.add(`${String(i).padStart(2, '0')}:00`)

      const groupedByJam: { [key: string]: LaporanPerJam } = {}
      
      jamSet.forEach(jam => {
        const jadwalCocok = jadwalData?.find((j: any) => j.jam_berangkat.substring(0, 5) === jam)
        const dataKapal = jadwalCocok ? kapalMap.get(jadwalCocok.kapal_id) : null
        
        groupedByJam[jam] = { 
          jam, total_terjual: 0, rincian: [], 
          nama_kapal: dataKapal?.nama || '-', 
          nama_kapten: dataKapal?.nama_kapten || '-'
        }
      })

      filtered.forEach((item: any) => {
        const jam = item.jadwal.jam_berangkat.substring(0, 5)
        if (!groupedByJam[jam]) groupedByJam[jam] = { jam, total_terjual: 0, rincian: [], nama_kapal: '-', nama_kapten: '-' }
        
        const group = groupedByJam[jam]
        group.total_terjual += 1
        group.rincian.push({
          id: item.id, 
          nama: item.nama_penumpang, 
          kursi: item.kursi?.nomor_kursi || '-', 
          kanal: item.kanal || 'loket', 
          kode_tiket: item.kode_tiket, 
          waktu_boarding: item.waktu_boarding || null
        })
      })

      setLaporan(Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam)))
      setLoading(false)
    }

    fetchData()
  }, [tanggal, lokasi])

  const handlePrint = () => {
    setTimeout(() => window.print(), 100)
  }

  const rincianAktif = expandedJam ? laporan.find(l => l.jam === expandedJam) : null

  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    return [...rincian].sort((a, b) => {
      if (!a.waktu_boarding && !b.waktu_boarding) return 0;
      if (!a.waktu_boarding) return 1;
      if (!b.waktu_boarding) return -1;
      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
    });
  }

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:bg-white print:block">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; margin: 15mm; -webkit-print-color-adjust: exact; }
          html, body, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .print-hidden { display: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}} />

      {/* ================= TAMPILAN 1: LIST MANIFEST ================= */}
      {!expandedJam ? (
        <>
          <div className="flex-shrink-0 bg-blue-800 text-white shadow-sm z-10 p-4 print-hidden">
            <div className="max-w-md mx-auto">
              <h1 className="text-lg font-bold leading-tight">PORTAL SYAHBANDAR</h1>
              <p className="text-xs text-blue-200 mt-0.5">Sistem Manifest Penumpang Kapal</p>
            </div>
          </div>

          <div className="flex-shrink-0 bg-white border-b border-gray-200 p-3 z-10 print-hidden">
            <div className="max-w-md mx-auto flex flex-col gap-2">
              <div className="w-full">
                <label className="block text-[10px] font-bold text-gray-700 mb-1">Pilih Rute (Asal)</label>
                <select value={lokasi} onChange={(e) => setLokasi(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                  <option value="Tarakan">Tarakan</option>
                  <option value="Tanjung Selor">Tanjung Selor</option>
                </select>
              </div>
              <div className="w-full">
                <label className="block text-[10px] font-bold text-gray-700 mb-1">Pilih Tanggal</label>
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full p-3 print-hidden">
            <div className="max-w-md mx-auto space-y-2">
              {loading ? (
                <p className="text-center text-gray-500 text-xs mt-4">Memuat data...</p>
              ) : (
                laporan.map((l) => (
                  <div key={l.jam} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <button 
                      onClick={() => setExpandedJam(l.jam)} 
                      className="w-full p-3 flex flex-col text-left hover:bg-gray-50 transition"
                    >
                      <div className="w-full mb-2">
                        <p className="font-bold text-xs text-gray-900 truncate">Manifest Jam {l.jam}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5 truncate">{l.nama_kapal}</p>
                      </div>
                      <div className="w-full flex justify-between items-center">
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{l.total_terjual} Penumpang</span>
                        <span className="text-[10px] text-blue-600">▼</span>
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        // ================= TAMPILAN 2: RINCIAN MANIFEST (FULL SCREEN) =================
        <>
          <div className="flex-shrink-0 bg-white shadow-sm z-10 p-3 print-hidden">
            <div className="max-w-md mx-auto flex justify-between items-center">
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">Rincian Manifest</h1>
                <p className="text-xs text-gray-600 mt-0.5">Jam {expandedJam}</p>
              </div>
              <button onClick={() => setExpandedJam(null)} className="text-[10px] bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 font-bold">
                Tutup
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 p-3 print-hidden">
            <div className="max-w-md mx-auto text-[10px] grid grid-cols-[70px_10px_1fr] gap-y-1.5 text-gray-700">
              <span>Tanggal</span><span>:</span><span>{tanggal}</span>
              <span>Rute</span><span>:</span><span>{lokasi} - {lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
              <span>Kapal</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapal}</span>
              <span>Kapten</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapten}</span>
              <span>Penumpang</span><span>:</span><span className="font-bold text-blue-700">{rincianAktif?.total_terjual} Orang</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full print-hidden">
            <div className="max-w-md mx-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 border-b text-center text-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-1 py-2 text-[10px] font-bold w-8">No</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-left">Nama / Kursi</th>
                    <th className="px-2 py-2 text-[10px] font-bold w-16">Scan</th>
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
                        <td className="px-1 py-2 text-[11px]">{idx + 1}</td>
                        <td className="px-2 py-2 text-[11px] font-bold text-left break-words">{p.nama} / {p.kursi}</td>
                        <td className="px-2 py-2 text-[10px]">
                          {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 print-hidden">
            <div className="max-w-md mx-auto">
              <button onClick={handlePrint} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm transition-colors">
                📋 Cetak Manifest (PDF)
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================= TAMPILAN PRINT (HANYA NO, NAMA, SCAN) ================= */}
      {rincianAktif && (
        <div className="hidden print:block print-section p-0 m-0">
          <h1 className="text-xl font-bold text-center mb-6">LAPORAN MANIFEST PENUMPANG JAM {rincianAktif.jam}</h1>
          <div className="mb-4 text-sm grid grid-cols-[120px_10px_1fr] gap-y-1">
            <span>Tanggal</span><span>:</span><span>{tanggal}</span>
            <span>Rute</span><span>:</span><span>{lokasi} - {lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
            <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
            <span>Kapten</span><span>:</span><span>{rincianAktif.nama_kapten}</span>
            <span className="whitespace-nowrap">Total Penumpang</span><span>:</span><span className="font-bold">{rincianAktif.total_terjual} Orang</span>
          </div>
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                <th className="border border-gray-400 px-2 py-1">NAMA / KURSI</th>
                <th className="border border-gray-400 px-2 py-1">SCAN</th>
              </tr>
            </thead>
            <tbody>
              {urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => (
                <tr key={p.id} className="text-gray-900 text-center">
                  <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                  <td className="border border-gray-400 px-2 py-1 font-bold text-left">{p.nama} / {p.kursi}</td>
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
    </div>
  )
}

export default function SyahbandarPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <SyahbandarContent />
    </Suspense>
  )
}