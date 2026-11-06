'use client'

import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'

type RincianPenumpang = {
  id: string; nama: string; kursi: string; kanal: string; kode_tiket: string
}

type LaporanPerJam = {
  jam: string; total_terjual: number; rincian: RincianPenumpang[]; nama_kapal: string; nama_kapten: string
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
          id, nama_penumpang, kode_tiket, kanal,
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
          id: item.id, nama: item.nama_penumpang, kursi: item.kursi?.nomor_kursi || '-', kanal: item.kanal || 'loket', kode_tiket: item.kode_tiket
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

  const potongKode = (kode: string) => kode.length > 6 ? `...${kode.slice(-6)}` : kode
  const rincianAktif = expandedJam ? laporan.find(l => l.jam === expandedJam) : null

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:p-0 print:m-0 print:min-h-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { 
            size: A4; 
            margin: 0; 
            @bottom-center {
              content: counter(page);
              font-size: 10pt;
              font-family: sans-serif;
            }
          }
          body { 
            background: white; 
            margin: 15mm; 
            -webkit-print-color-adjust: exact;
          }
          
          /* TRIK ANTI HALAMAN KOSONG */
          html, body, div {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          .min-h-screen {
            min-height: auto !important;
          }
          .print-hidden {
            display: none !important;
          }
          
          /* Memastikan tabel tidak memotong baris di tengah */
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}} />

      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6 bg-blue-800 text-white p-4 rounded shadow-sm print-hidden">
          <div>
            <h1 className="text-xl font-bold">PORTAL SYAHBANDAR</h1>
            <p className="text-sm text-blue-200">Sistem Manifest Penumpang Kapal</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex flex-wrap items-center gap-4 print-hidden">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Rute (Asal)</label>
            <select value={lokasi} onChange={(e) => setLokasi(e.target.value)} className="border rounded px-3 py-2 text-sm text-gray-900">
              <option value="Tarakan">Tarakan</option>
              <option value="Tanjung Selor">Tanjung Selor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Tanggal</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-3 py-2 text-sm text-gray-900" />
          </div>
        </div>

        <div className="space-y-3 print-hidden">
          {loading ? (
            <p className="text-center text-gray-500">Memuat data...</p>
          ) : (
            laporan.map((l) => (
              <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                <button 
                  onClick={() => setExpandedJam(expandedJam === l.jam ? null : l.jam)} 
                  className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🚢</span>
                    <span className="font-bold text-gray-900">Manifest Jam {l.jam}</span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{l.nama_kapal}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-blue-600">{l.total_terjual} Penumpang</span>
                    <span className="text-blue-600">{expandedJam === l.jam ? '▲' : '▼'}</span>
                  </div>
                </button>
              </div>
            ))
          )}
        </div>

        {expandedJam && rincianAktif && (
          <div className="mt-8 print-hidden">
            <div className="bg-white rounded shadow border-2 border-blue-400 overflow-hidden">
              <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">Rincian Manifest Jam {expandedJam}</h3>
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-green-700">
                    🖨️ Cetak Manifest
                  </button>
                  <button onClick={() => setExpandedJam(null)} className="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-700">
                    Tutup
                  </button>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 border-b text-sm grid grid-cols-[100px_10px_1fr] gap-y-1 text-gray-800">
                <span>Tanggal</span><span>:</span><span>{tanggal}</span>
                <span>Rute</span><span>:</span><span>{lokasi} - {lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
                <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
                <span>Kapten</span><span>:</span><span className="font-bold">{rincianAktif.nama_kapten}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama / Kursi</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kanal</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rincianAktif.rincian.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                          Belum ada penumpang yang terdaftar di jam ini.
                        </td>
                      </tr>
                    ) : (
                      rincianAktif.rincian.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900">{p.nama} / {p.kursi}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-600">{potongKode(p.kode_tiket)}</td>
                          <td className="px-4 py-3 text-xs uppercase">{p.kanal}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAMPILAN PRINT: MANIFEST */}
        {expandedJam && rincianAktif && (
          <div className="hidden print:block mt-8">
            <h1 className="text-xl font-bold text-center mb-6">LAPORAN MANIFEST PENUMPANG JAM {rincianAktif.jam}</h1>
            <div className="mb-4 text-sm grid grid-cols-[100px_10px_1fr] gap-y-1">
              <span>Tanggal</span><span>:</span><span>{tanggal}</span>
              <span>Rute</span><span>:</span><span>{lokasi} - {lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
              <span>Kapal</span><span>:</span><span>{rincianAktif.nama_kapal}</span>
              <span>Kapten</span><span>:</span><span>{rincianAktif.nama_kapten}</span>
            </div>
            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr>
                  <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                  <th className="border border-gray-400 px-2 py-1">NAMA / KURSI</th>
                  <th className="border border-gray-400 px-2 py-1">KODE</th>
                  <th className="border border-gray-400 px-2 py-1">KANAL</th>
                </tr>
              </thead>
              <tbody>
                {rincianAktif.rincian.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                    <td className="border border-gray-400 px-2 py-1 font-bold">{p.nama} / {p.kursi}</td>
                    <td className="border border-gray-400 px-2 py-1 font-mono text-xs">{potongKode(p.kode_tiket)}</td>
                    <td className="border border-gray-400 px-2 py-1 text-center text-xs uppercase">{p.kanal}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td colSpan={3} className="border border-gray-400 px-2 py-1 text-center">TOTAL PENUMPANG</td>
                  <td className="border border-gray-400 px-2 py-1 text-center">{rincianAktif.total_terjual}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SyahbandarPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <SyahbandarContent />
    </Suspense>
  )
}