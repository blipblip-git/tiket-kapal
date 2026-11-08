'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type DataRute = {
  total_penumpang: number
  total_pendapatan: number
}

type GabunganPerJam = {
  jam: string
  nama_kapal: string
  tarakan: DataRute
  tanjungSelor: DataRute
}

export default function LaporanGabunganPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [laporan, setLaporan] = useState<GabunganPerJam[]>([])
  
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) {
        const adminProfile = await getProfile()
        if (adminProfile) currentProfile = adminProfile
      }
      if (!currentProfile) { router.push('/login'); return }
      setProfile(currentProfile)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      const { data: templateData } = await supabase
        .from('template_jadwal')
        .select('jam_berangkat, rute_asal')
      
      const jamSet = new Set<string>()
      if (templateData) {
        templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))
      }

      const { data: pesananData, error } = await supabase
        .from('pesanan')
        .select(`
          id, jadwal:jadwal_id (rute_asal, rute_tujuan, harga, tanggal, jam_berangkat, kapal_id)
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', tanggal)

      if (error) { setError('Gagal memuat laporan: ' + error.message); setLoading(false); return }

      // Ambil data kapal untuk dapetin nama kapal
      const kapalIds = [...new Set(pesananData?.map((p: any) => p.jadwal?.kapal_id).filter(Boolean) || [])]
      const kapalMap = new Map()
      if (kapalIds.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('id, nama').in('id', kapalIds)
        kapalData?.forEach((k: any) => kapalMap.set(k.id, k.nama))
      }

      const grouped: { [key: string]: GabunganPerJam } = {}
      
      jamSet.forEach(jam => {
        grouped[jam] = {
          jam,
          nama_kapal: '-',
          tarakan: { total_penumpang: 0, total_pendapatan: 0 },
          tanjungSelor: { total_penumpang: 0, total_pendapatan: 0 }
        }
      })

      if (pesananData) {
        pesananData.forEach((item: any) => {
          if (!item.jadwal) return;
          const jam = item.jadwal.jam_berangkat.substring(0, 5)
          if (!grouped[jam]) {
            grouped[jam] = {
              jam,
              nama_kapal: '-',
              tarakan: { total_penumpang: 0, total_pendapatan: 0 },
              tanjungSelor: { total_penumpang: 0, total_pendapatan: 0 }
            }
          }

          // Set nama kapal kalau belum ada
          if (item.jadwal.kapal_id && kapalMap.has(item.jadwal.kapal_id)) {
            grouped[jam].nama_kapal = kapalMap.get(item.jadwal.kapal_id)
          }

          if (item.jadwal.rute_asal === 'Tarakan') {
            grouped[jam].tarakan.total_penumpang += 1
            grouped[jam].tarakan.total_pendapatan += item.jadwal.harga || 0
          } else if (item.jadwal.rute_asal === 'Tanjung Selor') {
            grouped[jam].tanjungSelor.total_penumpang += 1
            grouped[jam].tanjungSelor.total_pendapatan += item.jadwal.harga || 0
          }
        })
      }

      const laporanArray = Object.values(grouped).sort((a, b) => a.jam.localeCompare(b.jam))
      setLaporan(laporanArray)
      setLoading(false)
    }

    if (profile) fetchData()
  }, [profile, tanggal])

  const handlePrint = () => {
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>
  if (!profile) return null

  const tanggalFormatHeader = new Date(tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  const totalPenumpangTarakan = laporan.reduce((sum, item) => sum + item.tarakan.total_penumpang, 0)
  const totalPendapatanTarakan = laporan.reduce((sum, item) => sum + item.tarakan.total_pendapatan, 0)
  const totalPenumpangTjSelor = laporan.reduce((sum, item) => sum + item.tanjungSelor.total_penumpang, 0)
  const totalPendapatanTjSelor = laporan.reduce((sum, item) => sum + item.tanjungSelor.total_pendapatan, 0)
  
  // Total keseluruhan
  const grandTotalPendapatan = totalPendapatanTarakan + totalPendapatanTjSelor

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          html, body { height: auto !important; overflow: hidden !important; }
          .no-print { display: none !important; }
          tr { page-break-inside: avoid; }
          table { page-break-inside: auto; }
        }
      `}} />

      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        
        {/* HEADER BARU */}
        <div className="flex justify-between items-start mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 print-hidden flex-shrink-0">
          <div>
            <h1 className="text-sm md:text-xl font-bold text-gray-900 leading-tight">Rekap Laporan Gabungan</h1>
            <p className="text-[10px] md:text-sm font-bold text-blue-600 mt-0.5">{tanggalFormatHeader} (hari ini)</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
            <button onClick={() => router.push('/laporan-penjualan-admin')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition">Kembali</button>
          </div>
        </div>

        {/* FILTER TANGGAL */}
        <div className="bg-white p-2 md:p-3 rounded shadow mb-3 flex items-center gap-2 print-hidden flex-shrink-0">
          <label className="text-[10px] md:text-sm font-medium text-gray-700">Pilih Tanggal:</label>
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-2 py-1 text-[10px] md:text-sm text-gray-900" />
        </div>

        {/* TABEL GABUNGAN (DIKUNCI 1 LAYAR) */}
        <div className="bg-white rounded shadow border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0 print:border-none print:shadow-none">
          <div className="overflow-y-auto flex-1">
            <table className="w-full table-fixed border-collapse text-gray-900">
              <thead className="bg-gray-100 border-b sticky top-0 z-10">
                <tr>
                  <th className="border p-1 text-[9px] md:text-xs w-[9%] text-center" rowSpan={2}>Jam</th>
                  <th className="border p-1 text-[9px] md:text-xs w-[22%] text-center" rowSpan={2}>Kapal</th>
                  <th className="border p-1 text-[9px] md:text-xs text-center" colSpan={2}>Rute</th>
                  <th className="border p-1 text-[9px] md:text-xs w-[20%] text-center align-middle" rowSpan={2}>Total Penjualan</th>
                </tr>
                <tr className="bg-gray-100">
                  <th className="border p-1 text-[8px] md:text-xs text-center w-[24.5%] leading-tight">Tarakan - Tanjung Selor</th>
                  <th className="border p-1 text-[8px] md:text-xs text-center w-[24.5%] leading-tight">Tanjung Selor - Tarakan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {laporan.map((l) => {
                  const totalBaris = l.tarakan.total_pendapatan + l.tanjungSelor.total_pendapatan;
                  return (
                    <tr key={l.jam} className="hover:bg-gray-50 text-center">
                      <td className="border p-1 text-[9px] md:text-xs font-bold">{l.jam}</td>
                      <td className="border p-1 text-[9px] md:text-xs font-medium break-words">{l.nama_kapal}</td>
                      <td className="border p-1 text-[9px] md:text-xs">
                        {l.tarakan.total_pendapatan > 0 ? `Rp ${l.tarakan.total_pendapatan.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="border p-1 text-[9px] md:text-xs">
                        {l.tanjungSelor.total_pendapatan > 0 ? `Rp ${l.tanjungSelor.total_pendapatan.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="border p-1 text-[9px] md:text-xs font-bold text-blue-700">
                        {totalBaris > 0 ? `Rp ${totalBaris.toLocaleString('id-ID')}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-blue-600 text-white font-bold text-center sticky bottom-0 z-10">
                <tr>
                  <td colSpan={2} className="p-1 border text-[9px] md:text-xs">TOTAL</td>
                  <td className="p-1 border text-[9px] md:text-xs">Rp {totalPendapatanTarakan.toLocaleString('id-ID')}</td>
                  <td className="p-1 border text-[9px] md:text-xs">Rp {totalPendapatanTjSelor.toLocaleString('id-ID')}</td>
                  <td className="p-1 border text-[9px] md:text-xs">Rp {grandTotalPendapatan.toLocaleString('id-ID')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* TAMPILAN PRINT KHUSUS LAPORAN GABUNGAN */}
        <div className="hidden print:block mt-8">
          <h1 className="text-xl font-bold text-center mb-6">REKAP LAPORAN GABUNGAN</h1>
          <div className="mb-4 text-sm grid grid-cols-[100px_10px_1fr] gap-y-1">
            <span>Tanggal</span><span>:</span><span>{tanggal}</span>
            <span>Rute</span><span>:</span><span>Tarakan & Tanjung Selor</span>
          </div>
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1" rowSpan={2}>Jam</th>
                <th className="border border-gray-400 px-2 py-1" rowSpan={2}>Kapal</th>
                <th className="border border-gray-400 px-2 py-1" colSpan={2}>Tarakan - Tanjung Selor</th>
                <th className="border border-gray-400 px-2 py-1" colSpan={2}>Tanjung Selor - Tarakan</th>
                <th className="border border-gray-400 px-2 py-1" rowSpan={2}>Total Penjualan</th>
              </tr>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1">Penumpang</th>
                <th className="border border-gray-400 px-2 py-1">Pendapatan</th>
                <th className="border border-gray-400 px-2 py-1">Penumpang</th>
                <th className="border border-gray-400 px-2 py-1">Pendapatan</th>
              </tr>
            </thead>
            <tbody>
              {laporan.map((l) => {
                const totalBaris = l.tarakan.total_pendapatan + l.tanjungSelor.total_pendapatan;
                return (
                  <tr key={l.jam} className="text-center text-gray-900">
                    <td className="border border-gray-400 px-2 py-1 font-bold">{l.jam}</td>
                    <td className="border border-gray-400 px-2 py-1">{l.nama_kapal}</td>
                    <td className="border border-gray-400 px-2 py-1">{l.tarakan.total_penumpang}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">Rp {l.tarakan.total_pendapatan.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-2 py-1">{l.tanjungSelor.total_penumpang}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">Rp {l.tanjungSelor.total_pendapatan.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right font-bold">Rp {totalBaris.toLocaleString('id-ID')}</td>
                  </tr>
                )
              })}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td colSpan={2} className="border border-gray-400 px-2 py-1">TOTAL</td>
                <td className="border border-gray-400 px-2 py-1">{totalPenumpangTarakan}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalPendapatanTarakan.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1">{totalPenumpangTjSelor}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalPendapatanTjSelor.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {grandTotalPendapatan.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}