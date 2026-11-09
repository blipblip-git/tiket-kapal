'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  status_boarding: string
  waktu_boarding: string | null
  is_balita: boolean
}

type LaporanPerJam = {
  jam: string
  total_terjual: number
  rincian: RincianPenumpang[]
  nama_kapal: string
  nama_kapten: string
}

function ManifestDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasi = searchParams.get('lokasi') || 'Tarakan'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
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
      if (!p) { router.push('/login'); return }
      setProfile(p)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!profile) return
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
          id, nama_penumpang, status_boarding, waktu_boarding, is_balita,
          jadwal:jadwal_id (jam_berangkat, rute_asal, kapal_id),
          kursi:kursi_id (nomor_kursi)
        `).eq('status', 'paid').eq('jadwal.tanggal', tanggal).eq('jadwal.rute_asal', lokasi)

      const filtered = (pesananData || []).filter((item: any) => item.jadwal !== null)

      const jamSet = new Set<string>()
      if (templateData) templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))

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
          status_boarding: item.status_boarding || 'belum',
          waktu_boarding: item.waktu_boarding || null,
          is_balita: item.is_balita || false
        })
      })

      setLaporan(Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam)))
      setLoading(false)
    }
    fetchData()
  }, [profile, tanggal, lokasi])

  const handlePrint = () => {
    if (!rincianAktif) return

    const printContent = `
      <html>
        <head>
          <title>Cetak Manifest</title>
          <style>
            body { font-family: sans-serif; padding: 15mm; margin: 0; }
            h1 { font-size: 18px; text-align: center; margin-bottom: 20px; }
            .info { font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 4px 8px; }
            th { background: #eee; text-align: center; }
            .text-left { text-align: left; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>LAPORAN MANIFEST PENUMPANG JAM ${expandedJam}</h1>
          <div class="info">
            <table style="border: none;">
              <tr><td style="border: none; width: 120px;">Tanggal</td><td style="border: none; width: 10px;">:</td><td style="border: none;">${tanggalFormatHeader}</td></tr>
              <tr><td style="border: none;">Rute</td><td style="border: none;">:</td><td style="border: none;">${lokasi} - ${lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</td></tr>
              <tr><td style="border: none;">Kapal</td><td style="border: none;">:</td><td style="border: none;">${rincianAktif.nama_kapal}</td></tr>
              <tr><td style="border: none;">Kapten</td><td style="border: none;">:</td><td style="border: none;">${rincianAktif.nama_kapten}</td></tr>
              <tr><td style="border: none;">Total</td><td style="border: none;">:</td><td style="border: none;">${rincianAktif.total_terjual} Orang</td></tr>
            </table>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">NO</th>
                <th>NAMA / KURSI</th>
                <th style="width: 100px;">SCAN</th>
              </tr>
            </thead>
            <tbody>
              ${urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td class="font-bold text-left">${p.nama} / ${p.kursi}${p.is_balita ? ' (Balita)' : ''}</td>
                  <td class="text-center">${p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                </tr>
              `).join('')}
              <tr class="font-bold">
                <td colspan="2" class="text-center">TOTAL PENUMPANG</td>
                <td class="text-center">${rincianAktif.total_terjual}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `

    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(printContent)
      doc.close()
      
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 1000)
      }, 500)
    }
  }
  
  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    return [...rincian].sort((a, b) => {
      if (!a.waktu_boarding && !b.waktu_boarding) return 0;
      if (!a.waktu_boarding) return 1;
      if (!b.waktu_boarding) return -1;
      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
    });
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  const now = new Date()
  const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  
  const laporanBelumClosed = laporan.filter(l => tanggal === hariIniStr && l.jam > jamSekarang)
  const laporanSudahClosed = laporan.filter(l => tanggal !== hariIniStr || l.jam <= jamSekarang)
  
  const rincianAktif = expandedJam ? laporan.find(l => l.jam === expandedJam) : null

  const tanggalFormatHeader = new Date(tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col overflow-hidden">
      <div className="max-w-md w-full mx-auto flex flex-col h-full">
        
        {!expandedJam ? (
          <>
            <div className="flex justify-between items-start mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 flex-shrink-0">
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Manifest {lokasi}</h1>
                <p className="text-[10px] md:text-sm font-bold text-blue-600 mt-0.5">{tanggalFormatHeader}</p>
              </div>
              <button onClick={() => router.push('/laporan-manifest')} className="text-[10px] md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition">
                &larr; Kembali
              </button>
            </div>

            <div className="bg-white p-2 rounded shadow mb-3 flex items-center gap-2 flex-shrink-0">
              <label className="text-[10px] md:text-xs font-medium text-gray-700">Tanggal:</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-2 py-1 text-[10px] md:text-xs text-gray-900" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pb-8">
              <div>
                <h2 className="text-xs md:text-sm font-bold text-gray-800 mb-2 border-b pb-1">OPEN SCHEDULE</h2>
                {laporanBelumClosed.length === 0 ? (
                  <p className="text-gray-500 bg-white p-3 rounded shadow text-[10px] md:text-xs">Belum ada jadwal open.</p>
                ) : (
                  <div className="space-y-2">
                    {laporanBelumClosed.map((l) => (
                      <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                        <button 
                          onClick={() => setExpandedJam(l.jam)}
                          className="w-full px-3 py-2 flex justify-between items-center hover:bg-gray-50 transition"
                        >
                          <div className="text-left">
                            <p className="font-bold text-xs text-gray-900">Jam {l.jam}</p>
                            <p className="text-[10px] text-gray-600">{l.nama_kapal}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">{l.total_terjual} Org</span>
                            <span className="text-blue-600 text-[10px]">▶</span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xs md:text-sm font-bold text-gray-800 mb-2 border-b pb-1">CLOSING SCHEDULE</h2>
                {laporanSudahClosed.length === 0 ? (
                  <p className="text-gray-500 bg-white p-3 rounded shadow text-[10px] md:text-xs">Belum ada jadwal closing.</p>
                ) : (
                  <div className="space-y-2">
                    {laporanSudahClosed.map((l) => (
                      <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                        <button 
                          onClick={() => setExpandedJam(l.jam)}
                          className="w-full px-3 py-2 flex justify-between items-center hover:bg-gray-50 transition"
                        >
                          <div className="text-left">
                            <p className="font-bold text-xs text-gray-900">Jam {l.jam}</p>
                            <p className="text-[10px] text-gray-600">{l.nama_kapal}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold">{l.total_terjual} Org</span>
                            <span className="text-blue-600 text-[10px]">▶</span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-start mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 flex-shrink-0">
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Rincian Manifest</h1>
                <p className="text-[10px] md:text-sm font-bold text-blue-600 mt-0.5">Jam {expandedJam} - {tanggalFormatHeader}</p>
              </div>
              <button onClick={() => setExpandedJam(null)} className="text-[10px] md:text-sm bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-md font-bold transition">
                Tutup
              </button>
            </div>

            <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 p-3">
              <div className="max-w-md mx-auto text-[10px] grid grid-cols-[70px_10px_1fr] gap-y-1.5 text-gray-700">
                <span>Tanggal</span><span>:</span><span>{tanggalFormatHeader}</span>
                <span>Rute</span><span>:</span><span>{lokasi} - {lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
                <span>Kapal</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapal}</span>
                <span>Kapten</span><span>:</span><span className="font-medium text-gray-900">{rincianAktif?.nama_kapten}</span>
                <span>Total</span><span>:</span><span className="font-bold text-blue-700">{rincianAktif?.total_terjual} Orang</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-white rounded shadow border border-gray-200 overflow-hidden">
              <div className="overflow-y-auto flex-1">
                <table className="w-full table-fixed border-collapse text-gray-900">
                  <thead className="bg-gray-100 border-b sticky top-0 z-10">
                    <tr>
                      <th className="border p-1 text-[9px] md:text-xs w-[10%] text-center">No</th>
                      <th className="border p-1 text-[9px] md:text-xs text-left">Nama / Kursi</th>
                      <th className="border p-1 text-[9px] md:text-xs w-[20%] text-center">Scan</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rincianAktif && urutkanBerdasarkanScan(rincianAktif.rincian).map((p, idx) => (
                      <tr key={p.id} className="hover:bg-gray-50 text-center">
                        <td className="border p-1 text-[9px] md:text-xs">{idx + 1}</td>
                        <td className="border p-1 text-[9px] md:text-xs font-bold text-left">
                          {p.nama} / {p.kursi}
                          {p.is_balita && <span className="text-[8px] md:text-[10px] text-orange-600 ml-1">(Balita)</span>}
                        </td>
                        <td className="border p-1 text-[9px] md:text-xs">
                          {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t flex-shrink-0">
                <button onClick={handlePrint} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm transition-colors">
                  📋 Cetak Manifest (PDF)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ManifestDetailPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <ManifestDetailContent />
    </Suspense>
  )
}