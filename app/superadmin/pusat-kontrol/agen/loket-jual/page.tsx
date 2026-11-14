'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Kursi = {
  id: string
  nomor_kursi: string
  status: string
  waktu_hold: string | null
}

function LoketJualSuperadminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jadwalId = searchParams.get('jadwal')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [kursi, setKursi] = useState<Kursi[]>([])
  const [layout, setLayout] = useState<string>('tanpa_layout')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dipilih, setDipilih] = useState<string[]>([])
  
  const [jadwalDetail, setJadwalDetail] = useState<any>(null)

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

      if (!jadwalId) {
        setError('Jadwal tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: j, error: errJ } = await supabase
        .from('jadwal')
        .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi)`)
        .eq('id', jadwalId)
        .maybeSingle()

      if (errJ || !j) {
        setError('Jadwal tidak ditemukan.')
        setLoading(false)
        return
      }
      setJadwalDetail(j)
      if (j.kapal?.layout_kursi) setLayout(j.kapal.layout_kursi)

      const { data: existingKursi } = await supabase
        .from('kursi')
        .select('id')
        .eq('jadwal_id', jadwalId)
        .limit(1)

      if (!existingKursi || existingKursi.length === 0) {
        const kapasitas = j.kapal?.kapasitas || 0
        if (kapasitas > 0) {
          const kursiPayload = []
          for (let i = 1; i <= kapasitas; i++) {
            kursiPayload.push({
              jadwal_id: jadwalId,
              nomor_kursi: i.toString(),
              status: 'kosong'
            })
          }
          await supabase.from('kursi').insert(kursiPayload)
        }
      }

      const { data: dataKursi } = await supabase
        .from('kursi')
        .select('*')
        .eq('jadwal_id', jadwalId)

      // === INI OBATNYA: FILTER UNIQUE NOMOR KURSI ===
      const uniqueMap = new Map<string, Kursi>()
      ;(dataKursi || []).forEach((k) => {
        if (!uniqueMap.has(k.nomor_kursi)) {
          uniqueMap.set(k.nomor_kursi, k)
        }
      })
      
      const sortedKursi = Array.from(uniqueMap.values()).sort((a, b) => {
        return parseInt(a.nomor_kursi) - parseInt(b.nomor_kursi)
      })

      setKursi(sortedKursi)
      setLoading(false)
    }

    init()
  }, [jadwalId, router])

  const toggleKursi = (id: string) => {
    if (dipilih.includes(id)) {
      setDipilih(dipilih.filter((k) => k !== id))
    } else {
      if (dipilih.length >= 30) {
        alert('Maksimal 30 kursi per pembelian')
        return
      }
      setDipilih([...dipilih, id])
    }
  }

  function renderKursiButton(k: Kursi) {
    const terisi = k.status === 'terisi' || k.status === 'hold'
    const terpilih = dipilih.includes(k.id)

    return (
      <button
        key={k.id}
        disabled={terisi && !terpilih}
        onClick={() => toggleKursi(k.id)}
        className={
          'w-full h-full flex items-center justify-center rounded md:rounded-md font-medium text-[10px] md:text-sm transition-colors ' +
          (terisi && !terpilih
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : terpilih
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-300')
        }
      >
        {k.nomor_kursi}
      </button>
    )
  }

  function renderLayout23() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 5) {
      baris.push(kursi.slice(i, i + 5))
    }

    return (
      <div className="flex flex-col h-full justify-between gap-1 md:gap-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-stretch gap-2 md:gap-4 flex-1">
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-4 md:w-8" />
            <div className="grid grid-cols-3 gap-1 md:gap-2 flex-1 max-w-[55%]">
              {row.slice(2, 5).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayout22() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 4) {
      baris.push(kursi.slice(i, i + 4))
    }

    return (
      <div className="flex flex-col h-full justify-between gap-1 md:gap-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-stretch gap-2 md:gap-4 flex-1">
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-4 md:w-8" />
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(2, 4).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayoutTanpa() {
    return (
      <div className="grid grid-cols-6 md:grid-cols-8 gap-1 md:gap-2 h-full w-full">
        {kursi.map((k) => renderKursiButton(k))}
      </div>
    )
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden">
      
      <div className="flex-shrink-0 p-3 md:p-6 pb-2 md:pb-4 bg-white shadow-sm z-10">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-gray-900">Jual Tiket</h1>
              <p className="text-xs md:text-sm text-gray-600">Mode Superadmin</p>
            </div>
            <button onClick={() => router.push('/superadmin/pusat-kontrol/agen/jual-tiket')} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mt-1">
              &larr; Kembali
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg mb-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-gray-900">{jadwalDetail?.rute_asal} - {jadwalDetail?.rute_tujuan}</p>
                <p className="text-xs text-gray-600">Jam {jadwalDetail?.jam_berangkat?.substring(0,5)}</p>
                <p className="text-xs text-gray-600">{jadwalDetail?.kapal?.nama}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm text-blue-700">Rp {jadwalDetail?.harga?.toLocaleString('id-ID')} / tiket</p>
                <p className="text-xs text-gray-600">Tgl {jadwalDetail?.tanggal}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-1">
            <h2 className="text-sm font-bold text-gray-900">Pilih Kursi</h2>
            <div className="flex gap-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Kosong</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Dipilih</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Terisi</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-2 md:p-4 flex flex-col max-w-md mx-auto w-full">
        <div className="bg-white p-2 md:p-6 rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col h-full overflow-hidden">
          {layout === '2-3' && renderLayout23()}
          {layout === '2-2' && renderLayout22()}
          {layout !== '2-3' && layout !== '2-2' && renderLayoutTanpa()}
        </div>
      </div>

      <div className="flex-shrink-0 p-3 md:p-6 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <p className="text-xs md:text-sm text-gray-800">
              Kursi dipilih:{' '}
              <span className="font-bold text-blue-600">
                {dipilih.length > 0 
                  ? dipilih.map((id) => kursi.find((k) => k.id === id)?.nomor_kursi).join(', ') 
                  : '-'}
              </span>
            </p>
          </div>

          <a
            href={dipilih.length > 0 ? `/superadmin/pusat-kontrol/agen/loket-jual/form?jadwal=${jadwalId}&kursi=${dipilih.join(',')}` : '#'}
            className={`block text-center font-bold py-3 rounded-lg transition-colors ${
              dipilih.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            onClick={(e) => {
              if (dipilih.length === 0) e.preventDefault();
            }}
          >
            Lanjut Isi Data →
          </a>
        </div>
      </div>
    </div>
  )
}

export default function LoketJualSuperadminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LoketJualSuperadminContent />
    </Suspense>
  )
}