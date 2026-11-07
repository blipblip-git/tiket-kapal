'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

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

function CariTiketContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [lokasiAktif, setLokasiAktif] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [jadwalList, setJadwalList] = useState<JadwalTampil[]>([])
  
  const [tanggal, setTanggal] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    async function init() {
      // Default tanggal MURNI HARI INI (WITA), tidak loncat ke besok
      const now = new Date()
      const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
      const hariIniWITA = witaTime.toISOString().split('T')[0]
      
      setTanggal(hariIniWITA)

      let userProfile = getOperatorSession()
      
      if (!userProfile) {
        const adminProfile = await getProfile()
        if (adminProfile && adminProfile.role === 'admin_utama') {
          userProfile = adminProfile
        }
      }

      if (!userProfile) {
        router.push('/login')
        return
      }

      if (userProfile.role !== 'terminal_keberangkatan' && userProfile.role !== 'admin_utama') {
        router.push('/login')
        return
      }

      setProfile(userProfile)

      const { data: dbProfile } = await supabase
        .from('profiles')
        .select('lokasi')
        .eq('id', userProfile.id)
        .single()

      if (dbProfile && dbProfile.lokasi) {
        setLokasiAktif(dbProfile.lokasi)
      } else {
        setLokasiAktif(userProfile.lokasi || 'Tarakan')
      }
      
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (lokasiAktif && tanggal) {
      loadJadwal(tanggal, lokasiAktif)
    }
  }, [lokasiAktif, tanggal])

  async function loadJadwal(tgl: string, lokasi: string) {
    setIsRefreshing(true)
    
    let filterKapalIds: string[] = []
    if (profile?.role === 'admin_utama') {
      const { data: kapalSaya } = await supabase
        .from('kapal')
        .select('id')
        .eq('operator_id', profile.id)
      
      if (kapalSaya) filterKapalIds = kapalSaya.map(k => k.id)
    }

    let query = supabase
      .from('jadwal')
      .select('id, rute_asal, rute_tujuan, jam_berangkat, harga, kapal_id, status_jadwal')
      .eq('tanggal', tgl)
      .eq('status', 'aktif')
      .eq('rute_asal', lokasi)

    if (filterKapalIds.length > 0) {
      query = query.in('kapal_id', filterKapalIds)
    }

    let { data: jadwalData } = await query

    if (!jadwalData || jadwalData.length === 0) {
      let templateQuery = supabase
        .from('template_jadwal')
        .select(`*, kapal:kapal_id(kapasitas)`)
        .eq('rute_asal', lokasi)
        .eq('aktif', true)

      if (filterKapalIds.length > 0) {
        templateQuery = templateQuery.in('kapal_id', filterKapalIds)
      }

      const { data: templates } = await templateQuery

      if (templates && templates.length > 0) {
        const newJadwalPayload = templates.map((t) => ({
          kapal_id: t.kapal_id,
          rute_asal: t.rute_asal,
          rute_tujuan: t.rute_tujuan,
          tanggal: tgl,
          jam_berangkat: t.jam_berangkat,
          harga: 150000, 
          status_jadwal: 'open',
        }))

        const { data: insertedJadwal, error: insertError } = await supabase
          .from('jadwal')
          .insert(newJadwalPayload, { ignoreDuplicates: true })
          .select('id, rute_asal, rute_tujuan, jam_berangkat, harga, kapal_id, status_jadwal')

        if (!insertError && insertedJadwal) {
          jadwalData = insertedJadwal
          
          const kursiPayload: any[] = []
          for (const j of insertedJadwal) {
            const t = templates.find((x: any) => x.jam_berangkat === j.jam_berangkat)
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
    
    // --- PERBAIKAN LOGIKA WAKTU WITA (UTC+8) ---
    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    const hariIniWITA = witaTime.toISOString().split('T')[0]
    const jamSekarangWITA = witaTime.getUTCHours()
    const menitSekarangWITA = witaTime.getUTCMinutes()

    if (jadwalData) {
      for (const j of jadwalData) {
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
    router.push(`/loket-jual?jadwal=${jadwalId}&mode=terminal`)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      
      {/* HEADER & FILTER TANGGAL */}
      <div className="flex-shrink-0 bg-white shadow-sm z-10 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Jual Tiket</h1>
              <p className="text-sm text-gray-600 mt-0.5">Petugas {lokasiAktif} : {profile.nama}</p>
            </div>
            <button onClick={() => router.push('/dashboard/keberangkatan')} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
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

      {/* DAFTAR JADWAL */}
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
                {/* Info Kiri */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {/* Baris Atas: Jam & Rute */}
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
                  
                  {/* Baris Bawah: Nama Kapal & Sisa Kursi */}
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

                {/* Tombol Aksi Kanan */}
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

export default function CariTiketPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <CariTiketContent />
    </Suspense>
  )
}