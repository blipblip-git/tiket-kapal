'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type JadwalItem = {
  id: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
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

      const { data, error } = await supabase
        .from('jadwal')
        .select(`
          id, jam_berangkat, harga,
          kapal:kapal_id (nama)
        `)
        .eq('rute_asal', asal)
        .eq('rute_tujuan', tujuan)
        .eq('tanggal', tanggal)
        .eq('status', 'aktif')
        .order('jam_berangkat', { ascending: true })

      if (!error && data) {
        setJadwalTersedia(data.map((item: any) => ({
          id: item.id,
          jam_berangkat: item.jam_berangkat,
          harga: item.harga,
          nama_kapal: item.kapal?.nama || '-'
        })))
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
        
        {/* ANIMASI BULATAN WARNA-WARNI BERPUTAR */}
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
          {jadwalTersedia.length === 0 ? (
            <div className="bg-white p-6 rounded-xl text-center shadow-sm border border-gray-200">
              <p className="text-gray-500 text-sm">Tidak ada jadwal yang tersedia untuk rute dan tanggal ini bray.</p>
            </div>
          ) : (
            jadwalTersedia.map((j) => (
              <button
                key={j.id}
                onClick={() => handlePilihJadwal(j.id)}
                className="w-full bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-purple-500 hover:bg-purple-50 transition-colors text-left flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-purple-700 text-xl">{j.jam_berangkat.substring(0, 5)}</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{j.nama_kapal}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">Rp {j.harga.toLocaleString('id-ID')}</p>
                  <p className="text-xs text-blue-600 font-bold mt-1">Pilih Tiket &rarr;</p>
                </div>
              </button>
            ))
          )}
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