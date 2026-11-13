'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type JadwalItem = {
  id: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
  isClosed: boolean
}

function PilihJadwalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const asal = searchParams.get('asal') || ''
  const tujuan = searchParams.get('tujuan') || ''
  const tanggal = searchParams.get('tanggal') || ''
  const operatorId = searchParams.get('operator') || ''

  const [loading, setLoading] = useState(true)
  const [jadwalTersedia, setJadwalTersedia] = useState<JadwalItem[]>([])
  const [showEmptyPopup, setShowEmptyPopup] = useState(false)

  useEffect(() => {
    async function fetchJadwal() {
      if (!asal || !tujuan || !tanggal) {
        router.push('/')
        return
      }

      try {
        // 1. AMBIL TEMPLATE
        let queryTemplate = supabase
          .from('template_jadwal')
          .select(`*, kapal:kapal_id(kapasitas)`)
          .eq('aktif', true)
          .eq('rute_asal', asal)
          .eq('rute_tujuan', tujuan)

        if (operatorId) {
          queryTemplate = queryTemplate.eq('operator_id', operatorId)
        }

        const { data: templates } = await queryTemplate

        // 2. AMBIL JADWAL YANG UDAH ADA
        let queryJadwal = supabase
          .from('jadwal')
          .select('id, jam_berangkat, harga, kapal_id, status_jadwal')
          .eq('tanggal', tanggal)
          .eq('status', 'aktif')
          .eq('rute_asal', asal)
          .eq('rute_tujuan', tujuan)

        if (operatorId) {
          queryJadwal = queryJadwal.eq('operator_id', operatorId)
        }

        let { data: jadwalData } = await queryJadwal

        // 3. AUTO-GENERATE (KALAU ADA TEMPLATE TAPI BELUM ADA JADWAL)
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
                tanggal: tanggal,
                jam_berangkat: t.jam_berangkat,
                harga: t.harga || 150000,
                status: 'aktif',
                status_jadwal: 'open',
                operator_id: operatorId || t.operator_id || null,
              });
            }
          }

          if (newJadwalPayload.length > 0) {
            await supabase
              .from('jadwal')
              .insert(newJadwalPayload, { ignoreDuplicates: true })

            // 3b. WAJIB QUERY ULANG SETELAH INSERT
            const { data: refreshedJadwal } = await queryJadwal
            jadwalData = refreshedJadwal

            // === BIKIN KURSI (HANYA KALAU BELUM ADA) ===
            const kursiPayload: any[] = []
            
            for (const j of (jadwalData || [])) {
               // CEK DULU: Apakah kursi untuk jadwal ini udah ada?
               const { data: existingKursi } = await supabase
                 .from('kursi')
                 .select('id')
                 .eq('jadwal_id', j.id)
                 .limit(1)

               // Kalau BELUM ADA, baru insert
               if (!existingKursi || existingKursi.length === 0) {
                 const t = templates.find((x: any) => 
                   x.kapal_id === j.kapal_id && 
                   x.rute_asal === asal && 
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
            }
            if (kursiPayload.length > 0) {
              await supabase.from('kursi').insert(kursiPayload)
            }
          }
        }

        // 4. CEK KOSONG SETELAH QUERY ULANG
        if (!jadwalData || jadwalData.length === 0) {
          setShowEmptyPopup(true)
          setLoading(false)
          return
        }

        // 5. TAMPILKAN DATA
        const { data: kapalData } = await supabase.from('kapal').select('id, nama')
        const kapalMap = new Map(kapalData?.map((k) => [k.id, k]) || [])

        const now = new Date()
        const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
        const hariIniWITA = witaTime.toISOString().split('T')[0]

        const mapped = jadwalData.map((item: any) => {
          let isClosed = false
          if (tanggal === hariIniWITA) {
            const [jamB, menitB] = item.jam_berangkat.split(':').map(Number)
            const totalMenitBerangkat = (jamB * 60) + menitB
            const totalMenitSekarang = (witaTime.getUTCHours() * 60) + witaTime.getUTCMinutes()
            
            if (totalMenitBerangkat - totalMenitSekarang <= 60) {
              isClosed = true
            }
          } else if (tanggal < hariIniWITA) {
            isClosed = true
          }

          return {
            id: item.id,
            jam_berangkat: item.jam_berangkat,
            harga: item.harga,
            nama_kapal: kapalMap.get(item.kapal_id)?.nama || '-',
            isClosed
          }
        }).sort((a, b) => a.jam_berangkat.localeCompare(b.jam_berangkat))

        setJadwalTersedia(mapped)
      } catch (err) {
        setShowEmptyPopup(true)
      } finally {
        setLoading(false)
      }
    }
    fetchJadwal()
  }, [asal, tujuan, tanggal, operatorId, router])

  const handlePilihJadwal = (jadwalId: string) => {
    router.push(`/kursi?jadwal=${jadwalId}`)
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center justify-center">
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .animate-spin-custom { animation: spin 1s linear infinite; }
        `}} />
        <div className="relative w-24 h-24 flex items-center justify-center mb-4">
          <div className="absolute w-24 h-24 rounded-full border-4 border-transparent border-t-red-500 border-r-yellow-400 border-b-green-500 border-l-blue-500 animate-spin-custom"></div>
          <div className="text-xs font-bold text-gray-500">Memuat...</div>
        </div>
        <p className="text-gray-700 font-medium text-sm">Mencari jadwal keberangkatan...</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-900 font-bold text-xl">&larr;</button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Pilih Jadwal</h1>
            <p className="text-xs text-gray-600">{asal} - {tujuan} | {tanggal}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="max-w-md mx-auto space-y-3">
          {jadwalTersedia.map((j) => (
            <button
              key={j.id}
              disabled={j.isClosed}
              onClick={() => handlePilihJadwal(j.id)}
              className={`w-full border p-4 rounded-xl shadow-sm text-left flex justify-between items-center transition-colors ${
                j.isClosed 
                  ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-70' 
                  : 'bg-white border-gray-200 hover:border-purple-500 hover:bg-purple-50'
              }`}
            >
              <div>
                <p className={`font-bold text-xl ${j.isClosed ? 'text-gray-500' : 'text-purple-700'}`}>
                  {j.jam_berangkat.substring(0, 5)}
                </p>
                <p className={`text-sm font-medium mt-1 ${j.isClosed ? 'text-gray-400' : 'text-gray-800'}`}>
                  {j.nama_kapal}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${j.isClosed ? 'text-gray-500' : 'text-gray-900'}`}>
                  Rp {j.harga.toLocaleString('id-ID')}
                </p>
                {!j.isClosed && (
                  <p className="text-xs text-blue-600 font-bold mt-1">Pilih Tiket &rarr;</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {showEmptyPopup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="text-6xl mb-4">🚢</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Jadwal Tidak Ditemukan</h3>
            <p className="text-sm text-gray-600 mb-6">
              Mohon maaf, untuk rute <b>{asal} - {tujuan}</b> pada tanggal <b>{tanggal}</b> belum ada jadwal kapal yang tersedia.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => router.push('/')} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition">
                Coba Tanggal Lain
              </button>
              <button onClick={() => setShowEmptyPopup(false)} className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PilihJadwalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-900">Memuat...</div>}>
      <PilihJadwalContent />
    </Suspense>
  )
}