'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, type Profile } from '@/lib/supabase'

type JadwalTampil = {
  id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
  kapasitas: number
  kursi_kosong: number
  total_kursi: number
  status_waktu: 'lewat' | 'sekarang'
  foto_url: string | null
}

function JualTiketAgenContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [jadwalList, setJadwalList] = useState<JadwalTampil[]>([])
  
  const [tanggal, setTanggal] = useState('')
  const [keyword, setKeyword] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi || sesi.role !== 'agen') {
      router.push('/login')
      return
    }
    setProfile(sesi)

    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    setTanggal(witaTime.toISOString().split('T')[0])
    
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (tanggal && profile) {
      loadJadwal(tanggal, profile.lokasi)
    }
  }, [tanggal, profile])

  async function loadJadwal(tgl: string, lokasiAgen: string) {
    setIsRefreshing(true)
    
    // 1. Ambil Template Jadwal SESUAI LOKASI AGEN SAJA
    const { data: templates } = await supabase
      .from('template_jadwal')
      .select(`*, kapal:kapal_id(kapasitas)`)
      .eq('aktif', true)
      .eq('rute_asal', lokasiAgen) // FILTER LOKASI

    // 2. Ambil Jadwal yang sudah ada di tanggal tersebut
    let { data: jadwalData } = await supabase
      .from('jadwal')
      .select('id, rute_asal, rute_tujuan, jam_berangkat, harga, kapal_id, status_jadwal')
      .eq('tanggal', tgl)
      .eq('status', 'aktif')
      .eq('rute_asal', lokasiAgen) // FILTER LOKASI

    // 3. SINKRONISASI: Pastikan semua template masuk ke jadwal harian
    if (templates && templates.length > 0) {
      const newJadwalPayload: any[] = []
      
      for (const t of templates) {
        const existing = jadwalData?.find((j: any) => 
          j.kapal_id === t.kapal_id && 
          j.rute_asal === t.rute_asal && 
          j.jam_berangkat === t.jam_berangkat
        );
        
        if (!existing) {
          newJadwalPayload.push({
            kapal_id: t.kapal_id,
            rute_asal: t.rute_asal,
            rute_tujuan: t.rute_tujuan,
            tanggal: tgl,
            jam_berangkat: t.jam_berangkat,
            harga: 150000, 
            status_jadwal: 'open',
          });
        }
      }

      if (newJadwalPayload.length > 0) {
        const { data: insertedJadwal, error: insertError } = await supabase
          .from('jadwal')
          .insert(newJadwalPayload, { ignoreDuplicates: true })
          .select('id, rute_asal, rute_tujuan, jam_berangkat, harga, kapal_id, status_jadwal')

        if (!insertError && insertedJadwal) {
          jadwalData = [...(jadwalData || []), ...insertedJadwal]
          
          const kursiPayload: any[] = []
          for (const j of insertedJadwal) {
            const t = templates.find((x: any) => 
              x.kapal_id === j.kapal_id && 
              x.rute_asal === j.rute_asal && 
              x.jam_berangkat === j.jam_berangkat
            )
            const kapasitas = t?.kapal?.kapasitas || 0
            if (kapasitas > 0) {
              for (let i = 1; i <= kapasitas; i++) {
                kursiPayload.push({
                  jadwal_id: j.id,
                  nomor_kursi: i.toString(),
                  status: 'kosong'
                })
              }
            }
          }
          if (kursiPayload.length > 0) {
            await supabase.from('kursi').insert(kursiPayload, { ignoreDuplicates: true })
          }
        }
      }
    }

    // 4. Tampilkan Data
    const { data: kapalData } = await supabase.from('kapal').select('id, nama, kapasitas, foto_url')
    const kapalMap = new Map(kapalData?.map((k) => [k.id, k]) || [])

    const finalList: JadwalTampil[] = []
    
    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    const hariIniWITA = witaTime.toISOString().split('T')[0]
    const jamSekarangWITA = witaTime.getUTCHours()
    const menitSekarangWITA = witaTime.getUTCMinutes()

    if (jadwalData) {
      // Hapus duplikat jadwal
      const uniqueJadwal = Array.from(new Map(jadwalData.map((j: any) => [`${j.kapal_id}-${j.rute_asal}-${j.jam_berangkat}`, j])).values())

      for (const j of uniqueJadwal) {
        const kapal = kapalMap.get(j.kapal_id)
        if (!kapal) continue

        const { data: kursiData } = await supabase.from('kursi').select('status').eq('jadwal_id', j.id)
        const total = kursiData?.length || 0
        const terisi = kursiData?.filter((k) => k.status === 'terisi').length || 0
        const hold = kursiData?.filter((k) => k.status === 'hold').length || 0

        const [jamB, menitB] = j.jam_berangkat.split(':').map(Number);

        let status_waktu: 'lewat' | 'sekarang' = 'sekarang'
        
        if (tgl === hariIniWITA) {
          const totalMenitBerangkat = (jamB * 60) + menitB;
          const totalMenitSekarang = (jamSekarangWITA * 60) + menitSekarangWITA;
          
          if (totalMenitBerangkat <= totalMenitSekarang) {
            status_waktu = 'lewat'
          }
        }

        finalList.push({
          id: j.id,
          rute_asal: j.rute_asal,
          rute_tujuan: j.rute_tujuan,
          jam_berangkat: j.jam_berangkat,
          harga: j.harga,
          nama_kapal: kapal.nama,
          kapasitas: kapal.kapasitas,
          kursi_kosong: total - terisi - hold,
          total_kursi: total,
          status_waktu,
          foto_url: kapal.foto_url
        })
      }
    }

    finalList.sort((a, b) => a.jam_berangkat.localeCompare(b.jam_berangkat))
    setJadwalList(finalList)
    setIsRefreshing(false)
  }

  function handleJualTiket(jadwalId: string) {
    router.push(`/agen/loket-jual?jadwal=${jadwalId}`)
  }

  const handleRefresh = () => {
    if (!profile) return
    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    const hariIniWITA = witaTime.toISOString().split('T')[0]
    setTanggal(hariIniWITA)
    loadJadwal(hariIniWITA, profile.lokasi)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Jual Tiket Agen</h1>
            <p className="text-sm text-gray-700">Agen: {profile.nama} ({profile.lokasi})</p>
          </div>
          <button onClick={() => router.push('/dashboard/agen')} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex flex-col md:flex-row gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="border rounded px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-gray-700 mb-1">Cari Nama/NIK/Kode (Opsional)</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="border rounded px-3 py-2 w-full text-sm text-gray-900"
            />
          </div>
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 font-medium disabled:bg-gray-400"
          >
            {isRefreshing ? 'Memuat...' : '🔄 Refresh'}
          </button>
        </div>

        <div className="space-y-3">
          {jadwalList.length === 0 ? (
            <p className="text-gray-500 bg-white p-4 rounded shadow text-sm">Tidak ada jadwal untuk tanggal ini.</p>
          ) : (
            jadwalList.map((j) => {
              const isLewat = j.status_waktu === 'lewat'
              return (
                <div key={j.id} className={`border rounded p-4 flex justify-between items-center shadow-sm ${isLewat ? 'bg-gray-200 opacity-60' : 'bg-white'}`}>
                  
                  <div className={`w-20 h-14 rounded border overflow-hidden flex items-center justify-center mr-4 flex-shrink-0 ${isLewat ? 'bg-gray-300' : 'bg-gray-100'}`}>
                    {j.foto_url ? (
                      <img src={j.foto_url} alt={j.nama_kapal} className={`w-full h-full object-cover ${isLewat ? 'grayscale' : ''}`} />
                    ) : (
                      <span className="text-[10px] text-gray-400">No Foto</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className={`font-bold text-lg ${isLewat ? 'text-gray-500' : 'text-gray-900'}`}>{j.rute_asal} → {j.rute_tujuan}</p>
                    <p className={`text-sm ${isLewat ? 'text-gray-500' : 'text-gray-700'}`}>{j.nama_kapal} • Jam {j.jam_berangkat.substring(0,5)}</p>
                    <p className={`text-sm mt-1 ${isLewat ? 'text-gray-500' : 'text-gray-700'}`}>
                      Sisa kursi: <span className={`font-bold ${isLewat ? 'text-gray-500' : 'text-green-700'}`}>{j.kursi_kosong}</span> / {j.total_kursi}
                    </p>
                  </div>
                  <div className="text-right flex flex-col gap-2">
                    <p className={`font-bold ${isLewat ? 'text-gray-500' : 'text-blue-600'}`}>Rp {j.harga.toLocaleString('id-ID')}</p>
                    
                    {isLewat ? (
                      <button disabled className="inline-block text-sm bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed font-medium">
                        Waktu Habis
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleJualTiket(j.id)} 
                        className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
                      >
                        Jual Tiket →
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}

export default function JualTiketAgenPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <JualTiketAgenContent />
    </Suspense>
  )
}