'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type DataJam = {
  jam: string
  kapalTarakan: string
  kapalTanjung: string
  tarakan: number
  tanjungSelor: number
}

export default function LaporanGabunganPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [data, setData] = useState<DataJam[]>([])
  const [tanggal, setTanggal] = useState('')

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(p)
      
      const today = new Date()
      const offset = today.getTimezoneOffset() * 60000
      const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0]
      setTanggal(localDate)
      
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!profile || !tanggal) return
      setLoading(true)

      // 1. Ambil semua jam dari template (biar jam kosong tetap muncul)
      const { data: templateData } = await supabase
        .from('template_jadwal')
        .select('jam_berangkat, rute_asal, kapal_id')
      
      // 2. Ambil data pesanan yang sudah paid di tanggal tersebut
      const { data: pesananData, error: errP } = await supabase
        .from('pesanan')
        .select(`
          jadwal:jadwal_id (rute_asal, rute_tujuan, jam_berangkat, harga, tanggal, kapal_id, kapal:kapal_id(nama)),
          pembayaran:pembayaran (metode)
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', tanggal)

      if (errP) {
        setError('Gagal memuat laporan: ' + errP.message)
        setLoading(false)
        return
      }

      // 3. Ambil data kapal untuk template (karena template cuma nyimpen kapal_id)
      const { data: kapalData } = await supabase.from('kapal').select('id, nama')
      const kapalMap = new Map(kapalData?.map(k => [k.id, k.nama]) || [])

      // 4. Kumpulkan semua jam unik dari template
      const semuaJam = new Set<string>()
      if (templateData) {
        templateData.forEach((t: any) => {
          if (t.jam_berangkat) semuaJam.add(t.jam_berangkat.substring(0, 5))
        })
      }

      // 5. Siapkan kerangka data (jam kosong dulu)
      const grouped: Record<string, DataJam> = {}
      semuaJam.forEach(jam => {
        // Cari nama kapal dari template untuk masing-masing rute
        const tmplTarakan = templateData?.find((t: any) => t.jam_berangkat.substring(0, 5) === jam && t.rute_asal === 'Tarakan')
        const tmplTanjung = templateData?.find((t: any) => t.jam_berangkat.substring(0, 5) === jam && t.rute_asal === 'Tanjung Selor')

        grouped[jam] = { 
          jam, 
          kapalTarakan: tmplTarakan ? (kapalMap.get(tmplTarakan.kapal_id) || '-') : '-',
          kapalTanjung: tmplTanjung ? (kapalMap.get(tmplTanjung.kapal_id) || '-') : '-',
          tarakan: 0, 
          tanjungSelor: 0 
        }
      })

      // 6. Masukkan data penjualan ke kerangka (DENGAN PENGAMAN)
      pesananData?.forEach((item: any) => {
        // PENGAMAN: Jika jadwal null (misal terhapus), lewati saja
        if (!item.jadwal) return

        const jam = item.jadwal.jam_berangkat.substring(0, 5)
        const ruteAsal = item.jadwal.rute_asal
        const harga = item.jadwal.harga || 0

        if (!grouped[jam]) {
          grouped[jam] = { 
            jam, 
            kapalTarakan: '-', 
            kapalTanjung: '-', 
            tarakan: 0, 
            tanjungSelor: 0 
          }
        }

        if (ruteAsal === 'Tarakan') {
          grouped[jam].tarakan += harga
          if (item.jadwal.kapal?.nama) grouped[jam].kapalTarakan = item.jadwal.kapal.nama
        } else if (ruteAsal === 'Tanjung Selor') {
          grouped[jam].tanjungSelor += harga
          if (item.jadwal.kapal?.nama) grouped[jam].kapalTanjung = item.jadwal.kapal.nama
        }
      })

      // 7. Ubah ke array dan urutkan berdasarkan jam
      const sorted = Object.values(grouped).sort((a, b) => a.jam.localeCompare(b.jam))
      setData(sorted)
      setLoading(false)
    }
    fetchData()
  }, [profile, tanggal])

  const handlePrint = () => {
    setTimeout(() => window.print(), 100)
  }

  if (loading && data.length === 0) return <p className="p-6 text-center text-gray-600">Memuat data...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>
  if (!profile) return null

  const grandTotalTarakan = data.reduce((sum, item) => sum + item.tarakan, 0)
  const grandTotalTanjung = data.reduce((sum, item) => sum + item.tanjungSelor, 0)
  const grandTotalGabungan = grandTotalTarakan + grandTotalTanjung

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
        }
      `}} />

      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rekap Laporan Harian Gabungan</h1>
            <p className="text-sm text-gray-600">Perbandingan pendapatan Tarakan & Tanjung Selor</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-bold">
              🖨️ Cetak Laporan
            </button>
            <button onClick={() => router.push('/laporan-penjualan-admin')} className="text-sm text-blue-600 hover:underline py-2 px-3">
              &larr; Kembali
            </button>
          </div>
        </div>

        <div className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Rekap Laporan Harian Gabungan</h1>
          <p className="text-sm text-gray-900 mt-2">Tanggal: {tanggal}</p>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex items-center gap-4 print-hidden">
          <label className="text-sm font-medium text-gray-700">Pilih Tanggal:</label>
          <input 
            type="date" 
            value={tanggal} 
            onChange={(e) => setTanggal(e.target.value)} 
            className="border rounded px-3 py-1 text-gray-900" 
          />
        </div>

        <div className="bg-white rounded shadow border border-gray-200 overflow-hidden print:shadow-none print:border-gray-400">
          <table className="w-full text-sm print:border-collapse print:border print:border-gray-400">
            <thead className="bg-gray-200 border-b text-center text-gray-900 print:bg-gray-100">
              <tr>
                <th className="px-2 py-3 border print:border-gray-400 w-16" rowSpan={2}>Jam</th>
                <th className="px-2 py-3 border print:border-gray-400 w-32" rowSpan={2}>Kapal</th>
                <th className="px-4 py-3 border print:border-gray-400" colSpan={2}>Rute</th>
              </tr>
              <tr>
                <th className="px-4 py-3 border print:border-gray-400 bg-gray-100">Tarakan - Tanjung Selor</th>
                <th className="px-4 py-3 border print:border-gray-400 bg-gray-100">Tanjung Selor - Tarakan</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Tidak ada jadwal di tanggal ini.</td>
                </tr>
              ) : (
                data.map((d) => (
                  <tr key={d.jam} className="hover:bg-gray-50 text-center">
                    <td className="px-2 py-3 font-bold text-gray-900 border print:border-gray-400">{d.jam}</td>
                    <td className="px-2 py-3 text-gray-900 border print:border-gray-400 text-left">
                      <div className="font-bold">{d.kapalTarakan}</div>
                      {d.kapalTanjung !== '-' && <div className="text-xs text-gray-500">{d.kapalTanjung}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 border print:border-gray-400">
                      {d.tarakan > 0 ? `Rp ${d.tarakan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 border print:border-gray-400">
                      {d.tanjungSelor > 0 ? `Rp ${d.tanjungSelor.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-blue-600 text-white font-bold text-center print:bg-gray-100 print:text-gray-900">
              <tr>
                <td colSpan={2} className="px-4 py-3 border text-left print:border-gray-400">TOTAL</td>
                <td className="px-4 py-3 border text-right print:border-gray-400">Rp {grandTotalTarakan.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 border text-right print:border-gray-400">Rp {grandTotalTanjung.toLocaleString('id-ID')}</td>
              </tr>
              <tr className="bg-blue-800 border-t-2 border-blue-900 print:bg-gray-200 print:border-gray-400">
                <td colSpan={4} className="px-4 py-4 text-center text-lg print:text-base">
                  Total Gabungan: Rp {grandTotalGabungan.toLocaleString('id-ID')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </div>
  )
}