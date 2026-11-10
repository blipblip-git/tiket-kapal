'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
}

function JualTiketAgenContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPreview = searchParams.get('preview') === 'true'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [jadwalList, setJadwalList] = useState<JadwalTampil[]>([])
  
  const [tanggal, setTanggal] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // STATE UNTUK TEKS DINAMIS
  const [teks, setTeks] = useState({
    judul_jual_tiket: 'Jual Tiket',
  })

  useEffect(() => {
    // FETCH TEKS DARI DATABASE
    async function fetchTeks() {
      const { data } = await supabase.from('pengaturan_teks').select('data_teks').eq('role', 'agen').single()
      if (data && data.data_teks) {
        setTeks(data.data_teks as any)
      }
    }
    fetchTeks()
  }, [])

  useEffect(() => {
    // JIKA MODE PREVIEW DARI SUPERADMIN, BUAT PROFIL PALSU
    if (isPreview) {
      setProfile({ 
        id: 'preview', 
        nama: 'Mode Pratinjau', 
        role: 'agen', 
        lokasi: 'Tarakan', 
        email: 'preview@superadmin.com' 
      } as Profile)
      
      const now = new Date()
      const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
      setTanggal(witaTime.toISOString().split('T')[0])
      setLoading(false)
      return
    }

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
  }, [router, isPreview])

  useEffect(() => {
    if (tanggal && profile) {
      loadJadwal(tanggal, profile.lokasi)
    }
  }, [tanggal, profile])

  async function loadJadwal(tgl: string, lokasiAgen: string) {
    setIsRefreshing(true)
    
    const { data: templates } = await supabase
      .from('template_jadwal')
      .select(`*, kapal:kapal_id(kapasitas)`)
      .eq('aktif', true)
      .eq('rute_asal', lokasiAgen)

    let { data: jadwalData } = await supabase
      .from('jadwal')
      .select('id, rute_asal, rute_tujuan, jam_berangkat, harga, kapal_id, status_jadwal')
      .eq('tanggal', tgl)
      .eq('status', 'aktif')
      .eq('rute_asal', lokasiAgen)

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

    const { data: kapalData } = await supabase.from('kapal').select('id, nama, kapasitas')
    const kapalMap = new Map(kapalData?.map((k) => [k.id, k]) || [])

    const finalList: JadwalTampil[] = []
    
    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    const hariIniWITA = witaTime.toISOString().split('T')[0]
    const jamSekarangWITA = witaTime.getUTCHours()
    const menitSekarangWITA = witaTime.getUTCMinutes()

    if (jadwalData) {
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
        })
      }
    }

    finalList.sort((a, b) => a.jam_berangkat.localeCompare(b.jam_berangkat))
    setJadwalList(finalList)
    setIsRefreshing(false)
  }

  function handleJualTiket(jadwalId: string) {
    if (isPreview) {
      alert('Ini mode pratinjau. Di aplikasi asli, ini akan membuka halaman pilih kursi.')
      return
    }
    router.push(`/agen/loket-jual?jadwal=${jadwalId}`)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      
      <div className="flex-shrink-0 bg-white shadow-sm z-10 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-3">
            <div>
              {/* TEKS DINAMIS DARI DATABASE */}
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{teks.judul_jual_tiket}</h1>
              <p className="text-sm text-gray-600 mt-0.5">Agen : {profile.lokasi}</p>
            </div>
            <button onClick={() => router.push(isPreview ? '/superadmin/pusat-kontrol/agen' : '/dashboard/agen')} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
              &larr; Kembali
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Tanggal Keberangkatan</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full p-4">
        <div className="max-w-md mx-auto space-y-3">
          
          {isRefreshing && jadwalList.length === 0 && (
            <p className="text-center text-gray-500 py-4 text-sm">Memuat jadwal...</p>
          )}

          {!isRefreshing && jadwalList.length === 0 && (
            <p className="text-center text-gray-500 py-4 bg-white rounded-lg border border-gray-200 text-sm">
              Tidak ada jadwal untuk tanggal ini.
            </p>
          )}

          {jadwalList.map((j) => {
            const isLewat = j.status_waktu === 'lewat'
            return (
              <div 
                key={j.id} 
                className={`bg-white p-3 rounded-lg shadow-sm border flex items-stretch gap-3 ${
                  isLewat ? 'border-gray-200 opacity-60' : 'border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${isLewat ? 'text-gray-500' : 'text-gray-900'} leading-tight`}>
                        {j.jam_berangkat.substring(0,5)}
                      </span>
                      <span className={`text-[10px] font-semibold truncate ${isLewat ? 'text-gray-400' : 'text-blue-800'}`}>
                        {j.rute_asal} - {j.rute_tujuan}
                      </span>
                    </div>
                    <div className={`font-bold text-xs whitespace-nowrap ml-2 ${isLewat ? 'text-gray-400' : 'text-blue-600'}`}>
                      Rp {j.harga.toLocaleString('id-ID')}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end mt-1">
                    <div className="min-w-0 pr-2">
                      <p className={`font-bold text-xs truncate leading-tight ${isLewat ? 'text-gray-500' : 'text-gray-900'}`}>
                        {j.nama_kapal}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isLewat ? 'text-gray-400' : 'text-gray-600'}`}>
                        Sisa kursi: <span className={`font-bold ${isLewat ? 'text-gray-400' : 'text-green-700'}`}>{j.kursi_kosong}</span> / {j.total_kursi}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="w-[70px] flex-shrink-0 flex items-stretch">
                  {isLewat ? (
                    <button disabled className="w-full flex items-center justify-center rounded-md bg-gray-200 text-gray-500 text-[10px] font-medium cursor-not-allowed text-center px-1">
                      Waktu Habis
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleJualTiket(j.id)} 
                      className="w-full flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-bold shadow-sm transition-colors"
                    >
                      Jual Tiket
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function JualTiketAgenPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <JualTiketAgenContent />
    </Suspense>
  )
}