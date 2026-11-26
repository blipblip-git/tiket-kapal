'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Kota = {
  id: string
  nama_kota: string
  singkatan: string
}

function OnlineSuperadminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const operatorId = searchParams.get('operator') || ''

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [kotaList, setKotaList] = useState<Kota[]>([])
  const [asal, setAsal] = useState('Tarakan')
  const [tujuan, setTujuan] = useState('Tanjung Selor')
  const [tanggal, setTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) {
        router.push('/superadmin')
        return
      }
      setProfile(p)

      // Ambil Data Master Rute / Daerah (Single Source of Truth)
      const { data: kotaData, error: errKota } = await supabase
        .from('master_kota')
        .select('*')
        .order('nama_kota', { ascending: true })

      if (errKota) {
        setError('Gagal memuat data kota: ' + errKota.message)
      } else if (kotaData && kotaData.length > 0) {
        setKotaList(kotaData)
        
        // Set default asal & tujuan kalau kosong atau nggak ada di list
        const namaKota = kotaData.map(k => k.nama_kota)
        if (!namaKota.includes(asal)) setAsal(kotaData[0].nama_kota)
        if (!namaKota.includes(tujuan) && kotaData.length > 1) {
          setTujuan(kotaData.find(k => k.nama_kota !== asal)?.nama_kota || kotaData[0].nama_kota)
        }
      }

      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleBukaEtalase = () => {
    const params = new URLSearchParams({
      asal: asal,
      tujuan: tujuan,
      tanggal: tanggal
    })
    if (operatorId) params.set('operator', operatorId)
    
    router.push(`/pilih-jadwal?${params.toString()}`)
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Pusat Kendali Lintasair</h1>
            <p className="text-sm text-gray-400">Simulasi Etalase Penjualan Online (Pembeli)</p>
          </div>
          <button 
            onClick={() => router.push('/dashboard-superadmin')} 
            className="text-sm bg-gray-800 px-4 py-2 rounded hover:bg-gray-700 border border-gray-700"
          >
            &larr; Kembali
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* KARTU PENCARIAN */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
              🔍 Cari Jadwal
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Rute Asal</label>
                <select
                  value={asal}
                  onChange={(e) => setAsal(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                >
                  {kotaList.length === 0 && <option value="">-- Belum ada kota --</option>}
                  {kotaList.map((k) => (
                    <option key={k.id} value={k.nama_kota}>{k.nama_kota} ({k.singkatan})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Rute Tujuan</label>
                <select
                  value={tujuan}
                  onChange={(e) => setTujuan(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                >
                  {kotaList.length === 0 && <option value="">-- Belum ada kota --</option>}
                  {kotaList.filter(k => k.nama_kota !== asal).map((k) => (
                    <option key={k.id} value={k.nama_kota}>{k.nama_kota} ({k.singkatan})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Tanggal Keberangkatan</label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <button
                onClick={handleBukaEtalase}
                disabled={kotaList.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                Buka Etalase Publik &rarr;
              </button>
            </div>
          </div>

          {/* KARTU INFO */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 flex flex-col justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🛥️</div>
              <h2 className="text-lg font-bold text-white mb-2">Simulasi Pembeli</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                Halaman ini hanya untuk <b>simulasi</b>. Tombol di samping akan membuka halaman <code className="bg-gray-900 px-1 rounded text-blue-300">/pilih-jadwal</code> (etalase publik asli) menggunakan parameter yang kamu pilih.
              </p>
              <p className="text-xs text-gray-500 mt-4">
                * Pembeli asli tidak akan pernah melihat halaman ini. Mereka langsung menuju Beranda (`/`).
              </p>
            </div>
          </div>

        </div>

        {/* LIST RUTE MASTER */}
        <div className="mt-8 bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
            <h3 className="font-bold text-white">Master Kota (Sumber Rute)</h3>
            <button 
              onClick={() => router.push('/superadmin/pusat-kontrol/kota')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Kelola Master Rute (Daerah) &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="px-6 py-3">Nama Kota</th>
                  <th className="px-6 py-3">Singkatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {kotaList.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-6 text-center text-gray-500 italic">
                      Belum ada data daerah. Silakan isi Master Rute (Daerah) dulu.
                    </td>
                  </tr>
                ) : (
                  kotaList.map((k) => (
                    <tr key={k.id} className="hover:bg-gray-750">
                      <td className="px-6 py-3 font-medium text-white">{k.nama_kota}</td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs font-mono font-bold">
                          {k.singkatan}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function OnlineSuperadminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>}>
      <OnlineSuperadminContent />
    </Suspense>
  )
}