'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession } from '@/lib/supabase'

function LaporanKeuanganContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') // 'tarakan' atau 'tanjung'
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<any[]>([])
  const [filterKanal, setFilterKanal] = useState<string>('semua')
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })

  const [expandedJam, setExpandedJam] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const sesi = getOperatorSession()
      const admin = await getProfile()

      if (!sesi && (!admin || admin.role !== 'admin_utama')) {
        router.push('/login')
        return
      }
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!view || loading) return

      const asalRute = view === 'tarakan' ? 'Tarakan' : 'Tanjung Selor'

      const { data: pesananData, error: errP } = await supabase
        .from('pesanan')
        .select(`
          id, nama_penumpang, kode_tiket, kanal, status_boarding,
          jadwal:jadwal_id (rute_asal, rute_tujuan, jam_berangkat, harga, tanggal, status_jadwal, kapal:kapal_id(nama)),
          kursi:kursi_id (nomor_kursi)
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', tanggal)
        .eq('jadwal.rute_asal', asalRute)

      if (errP) {
        setError('Gagal memuat: ' + errP.message)
        return
      }

      if (pesananData) {
        const dataAman = pesananData.filter((item: any) => item.jadwal !== null)
        setData(dataAman)
      }
    }

    fetchData()
  }, [view, tanggal, loading])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>

  if (!view) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Laporan Keuangan</h1>
            <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline">
              &larr; Kembali ke Dashboard
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => router.push('/laporan-keuangan?view=tarakan')}
              className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition border border-gray-200 text-center"
            >
              <div className="text-5xl mb-4">⛴️</div>
              <h2 className="text-2xl font-bold text-gray-900">Tarakan</h2>
              <p className="text-sm text-gray-600 mt-2">Lihat rekap penjualan tiket dari Tarakan.</p>
            </button>

            <button 
              onClick={() => router.push('/laporan-keuangan?view=tanjung')}
              className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition border border-gray-200 text-center"
            >
              <div className="text-5xl mb-4">⛴️</div>
              <h2 className="text-2xl font-bold text-gray-900">Tanjung Selor</h2>
              <p className="text-sm text-gray-600 mt-2">Lihat rekap penjualan tiket dari Tanjung Selor.</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const asalRute = view === 'tarakan' ? 'Tarakan' : 'Tanjung Selor'
  const grouped: { [key: string]: any } = {}
  
  data.forEach((item: any) => {
    if (filterKanal !== 'semua' && item.kanal !== filterKanal) return
    if (!item.jadwal || !item.jadwal.jam_berangkat) return

    const jam = item.jadwal.jam_berangkat.substring(0, 5)
    if (!grouped[jam]) {
      grouped[jam] = {
        jam,
        nama_kapal: item.jadwal.kapal?.nama || '-',
        rute: `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`,
        total_penumpang: 0,
        total_pendapatan: 0,
        status_jadwal: item.jadwal.status_jadwal,
        rincian: []
      }
    }
    grouped[jam].total_penumpang += 1
    grouped[jam].total_pendapatan += item.jadwal.harga || 0
    grouped[jam].rincian.push(item)
  })

  const tableData = Object.values(grouped).sort((a: any, b: any) => a.jam.localeCompare(b.jam))

  const now = new Date()
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  const boardingData = data.filter((item: any) => 
    item.status_boarding === 'sudah' && 
    item.jadwal.status_jadwal !== 'berangkat' && 
    item.jadwal.jam_berangkat.substring(0,5) >= jamSekarang &&
    (filterKanal === 'semua' || item.kanal === filterKanal)
  )

  const getWarnaKanal = (kanal: string) => {
    if (kanal === 'online') return 'bg-green-100 text-green-800 border-green-300'
    if (kanal === 'loket') return 'bg-blue-100 text-blue-800 border-blue-300'
    if (kanal === 'mobile') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    if (kanal === 'keberangkatan') return 'bg-orange-100 text-orange-800 border-orange-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded shadow-sm border border-gray-200">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Laporan Harian {asalRute}</h1>
          </div>
          <button onClick={() => router.push('/laporan-keuangan')} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Tanggal:</label>
            <input 
              type="date" 
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="border rounded px-3 py-1 text-gray-900"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterKanal('semua')} className={`px-3 py-1 rounded text-xs font-bold border ${filterKanal === 'semua' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Semua</button>
            <button onClick={() => setFilterKanal('online')} className={`px-3 py-1 rounded text-xs font-bold border ${filterKanal === 'online' ? 'bg-green-600 text-white' : 'bg-white text-green-700 hover:bg-green-50'}`}>Online</button>
            <button onClick={() => setFilterKanal('loket')} className={`px-3 py-1 rounded text-xs font-bold border ${filterKanal === 'loket' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-50'}`}>Loket</button>
            <button onClick={() => setFilterKanal('mobile')} className={`px-3 py-1 rounded text-xs font-bold border ${filterKanal === 'mobile' ? 'bg-yellow-500 text-white' : 'bg-white text-yellow-700 hover:bg-yellow-50'}`}>Mobile</button>
            <button onClick={() => setFilterKanal('keberangkatan')} className={`px-3 py-1 rounded text-xs font-bold border ${filterKanal === 'keberangkatan' ? 'bg-orange-500 text-white' : 'bg-white text-orange-700 hover:bg-orange-50'}`}>Keberangkatan</button>
          </div>
        </div>

        <div className="bg-white rounded shadow mb-8 overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3">
            <h2 className="font-bold">Penumpang Siap Berangkat (Sudah Boarding)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kursi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kanal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jam</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {boardingData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Belum ada penumpang yang boarding.</td>
                  </tr>
                ) : (
                  boardingData.map((p: any, idx: number) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{p.nama_penumpang}</td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600">{p.kursi?.nomor_kursi}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded border text-xs font-bold uppercase ${getWarnaKanal(p.kanal)}`}>
                          {p.kanal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.jadwal.jam_berangkat.substring(0,5)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded shadow overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-3">
            <h2 className="font-bold">Rekap Penjualan Per Jam</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jam</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Kapal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jml Penumpang</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Rp</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tableData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">Tidak ada data penjualan pada tanggal dan filter ini.</td>
                  </tr>
                ) : (
                  tableData.map((row: any) => (
                    <tr key={row.jam} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.jam}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.nama_kapal}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.rute}</td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600 text-center">{row.total_penumpang}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Rp {row.total_pendapatan.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setExpandedJam(expandedJam === row.jam ? null : row.jam)} className="text-blue-600 text-sm font-medium hover:underline">
                          {expandedJam === row.jam ? 'Tutup' : 'Rincian'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {expandedJam && (
          <div className="mt-6 bg-white rounded shadow border-2 border-blue-400 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="font-bold">Rincian Jam {expandedJam}</h3>
              <button onClick={() => setExpandedJam(null)} className="text-sm bg-white text-blue-700 px-3 py-1 rounded hover:bg-gray-100 font-medium">Tutup</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kursi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kanal</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Harga</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tableData.find((r: any) => r.jam === expandedJam)?.rincian.map((p: any, idx: number) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{p.nama_penumpang}</td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600">{p.kursi?.nomor_kursi}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded border text-xs font-bold uppercase ${getWarnaKanal(p.kanal)}`}>
                          {p.kanal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">Rp {p.jadwal.harga.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function LaporanKeuanganPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <LaporanKeuanganContent />
    </Suspense>
  )
}