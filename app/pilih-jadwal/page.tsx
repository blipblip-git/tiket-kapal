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

  const [loading, setLoading] = useState(true)
  const [jadwalTersedia, setJadwalTersedia] = useState<JadwalItem[]>([])

  useEffect(() => {
    async function fetchJadwal() {
      if (!asal || !tujuan || !tanggal) {
        router.push('/')
        return
      }

      // 1. AMBIL TEMPLATE JADWAL
      const { data: templates } = await supabase
        .from('template_jadwal')
        .select(`*, kapal:kapal_id(kapasitas)`)
        .eq('aktif', true)
        .eq('rute_asal', asal)

      // 2. CEK JADWAL YANG SUDAH ADA
      let { data: jadwalData } = await supabase
        .from('jadwal')
        .select('id, jam_berangkat, harga, kapal_id, status_jadwal')
        .eq('tanggal', tanggal)
        .eq('status', 'aktif')
        .eq('rute_asal', asal)

      // 3. AUTO-GENERATE JIKA KOSONG
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
              harga: 150000, 
              status_jadwal: 'open',
            });
          }
        }

        if (newJadwalPayload.length > 0) {
          const { data: insertedJadwal, error: insertError } = await supabase
            .from('jadwal')
            .insert(newJadwalPayload, { ignoreDuplicates: true })
            .select('id, jam_berangkat, harga, kapal_id, status_jadwal')

          if (!insertError && insertedJadwal) {
            jadwalData = [...(jadwalData || []), ...insertedJadwal]
            
            // BIKIN KURSI OTOMATIS
            const kursiPayload: any[] = []
            for (const j of insertedJadwal) {
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
            if (kursiPayload.length > 0) {
              await supabase.from('kursi').insert(kursiPayload, { ignoreDuplicates: true })
            }
          }
        }
      }

      // 4. TAMPILKAN DATA
      const { data: kapalData } = await supabase.from('kapal').select('id, nama')
      const kapalMap = new Map(kapalData?.map((k) => [k.id, k]) || [])

      if (jadwalData) {
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
      }
      
      setLoading(false)
    }
    fetchJadwal()
  }, [asal, tujuan, tanggal, router])

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
          .animate-spin-custom {
            animation: spin 1s linear infinite;
          }
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
          {/* KALAU KOSONG, CUMA DIEM AJA / KOSONGAN */}
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