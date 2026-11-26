'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchPublik } from '@/lib/publikFetch'
import {
  beroperasiPada,
  gabungHariOperasi,
  labelHari,
  namaHari,
  LABEL_HARI,
  formatTanggalPanjang,
  tanggalOperasiTerdekatDari
} from '@/lib/hari'
import IkonKapal from '@/components/IkonKapal'

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
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [jadwalTersedia, setJadwalTersedia] = useState<JadwalItem[]>([])
  const [showEmptyPopup, setShowEmptyPopup] = useState(false)
  const [infoKosong, setInfoKosong] = useState<{ hariTerpilih: string; hariOperasi: string; tanggalTerdekat: string } | null>(null)
  const [singkatanKota, setSingkatanKota] = useState<Record<string, string>>({})

  // Singkatan (TRK, TJS, dst) dari Master Rute, hanya untuk tampilan.
  useEffect(() => {
    async function ambilSingkatan() {
      const { data } = await supabase.from('master_kota').select('nama_kota, singkatan')
      if (!data) return
      const map: Record<string, string> = {}
      data.forEach((k: any) => {
        if (k.nama_kota) map[k.nama_kota] = (k.singkatan || '').trim()
      })
      setSingkatanKota(map)
    }
    ambilSingkatan()
  }, [])

  const labelRute = (nama: string) => (singkatanKota[nama] ? `${nama} / ${singkatanKota[nama]}` : nama)

  useEffect(() => {
    async function fetchJadwal() {
      if (reloadKey > 0) setRefreshing(true)

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

        // Hanya template yang beroperasi pada hari dari tanggal yang dipilih.
        // Contoh: kapal jalan Senin/Rabu/Jumat → Sabtu tidak dibuatkan jadwal.
        const templatesOperasi = (templates || []).filter((t: any) => beroperasiPada(tanggal, t.hari_operasi))
        setInfoKosong(null)

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

        // 3. AUTO-GENERATE JADWAL (diproses SERVER — browser tidak punya hak tulis)
        if (templatesOperasi.length > 0) {
          try {
            await fetchPublik('/api/publik/siapkan-jadwal', {
              method: 'POST',
              body: JSON.stringify({
                tanggal,
                rute_asal: asal,
                rute_tujuan: tujuan,
                operator_id: operatorId || null
              })
            })
            const { data: refreshedJadwal } = await queryJadwal
            jadwalData = refreshedJadwal
          } catch (err) {
            console.error('Gagal menyiapkan jadwal:', err)
          }
        }

        // 4. CEK KOSONG SETELAH QUERY ULANG
        if (!jadwalData || jadwalData.length === 0) {
          const semuaTemplate = (templates || []) as any[]
          if (semuaTemplate.length > 0 && templatesOperasi.length === 0) {
            const hariDipilih = namaHari(tanggal)
            setInfoKosong({
              hariTerpilih: hariDipilih ? LABEL_HARI[hariDipilih] : tanggal,
              hariOperasi: labelHari(gabungHariOperasi(semuaTemplate.map((t) => t.hari_operasi))),
              tanggalTerdekat: tanggalOperasiTerdekatDari(tanggal, semuaTemplate.map((t) => t.hari_operasi))
            })
          }
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
        setRefreshing(false)
        setLoading(false)
      }
    }
    fetchJadwal()
  }, [asal, tujuan, tanggal, operatorId, router, reloadKey])

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
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Pilih Jadwal</h1>
            <p className="text-xs text-gray-600">{labelRute(asal)} - {labelRute(tujuan)} | {tanggal}</p>
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={refreshing}
            title="Muat ulang jadwal"
            aria-label="Muat ulang jadwal"
            className="text-sm bg-gray-100 text-gray-700 border border-gray-300 px-2.5 py-1.5 rounded hover:bg-gray-200 font-bold disabled:opacity-50"
          >
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
          </button>
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
              <div className="flex items-center gap-2">
                {/* Ilustrasi kapal di sebelah jam berangkat */}
                <IkonKapal
                  className={`shrink-0 w-[clamp(58px,18vw,76px)] h-auto ${j.isClosed ? 'opacity-60 grayscale' : ''}`}
                />
                <div className="min-w-0">
                  <p className={`font-bold text-xl truncate ${j.isClosed ? 'text-gray-500' : 'text-purple-700'}`}>
                    {j.jam_berangkat.substring(0, 5)}
                  </p>
                  <p className={`text-sm font-medium mt-1 truncate ${j.isClosed ? 'text-gray-400' : 'text-gray-800'}`}>
                    {j.nama_kapal}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold whitespace-nowrap ${j.isClosed ? 'text-gray-500' : 'text-gray-900'}`}>
                  Rp {j.harga.toLocaleString('id-ID')}
                </p>
                {!j.isClosed && (
                  <p className="text-xs text-blue-600 font-bold mt-1 whitespace-nowrap">Pilih Tiket &rarr;</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {showEmptyPopup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <IkonKapal ombak className="w-32 h-auto mx-auto mb-3" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {infoKosong ? 'Kapal Tidak Beroperasi' : 'Jadwal Tidak Ditemukan'}
            </h3>
            {infoKosong ? (
              <p className="text-sm text-gray-600 mb-6">
                Mohon maaf, untuk rute <b>{labelRute(asal)} - {labelRute(tujuan)}</b> tidak ada kapal yang beroperasi pada hari <b>{infoKosong.hariTerpilih}</b> ({tanggal}).
                Kapal hanya berjalan pada <b>{infoKosong.hariOperasi}</b>.
                {infoKosong.tanggalTerdekat && (
                  <> Jadwal terdekat: <b>{formatTanggalPanjang(infoKosong.tanggalTerdekat)}</b>.</>
                )}
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-6">
                Mohon maaf, untuk rute <b>{labelRute(asal)} - {labelRute(tujuan)}</b> pada tanggal <b>{tanggal}</b> belum ada jadwal kapal yang tersedia.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {infoKosong?.tanggalTerdekat ? (
                <button
                  onClick={() => {
                    const params = new URLSearchParams({ asal, tujuan, tanggal: infoKosong.tanggalTerdekat })
                    if (operatorId) params.set('operator', operatorId)
                    router.push(`/pilih-jadwal?${params.toString()}`)
                  }}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition"
                >
                  Lihat Jadwal {formatTanggalPanjang(infoKosong.tanggalTerdekat)}
                </button>
              ) : (
                <button onClick={() => router.push('/')} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition">
                  Coba Tanggal Lain
                </button>
              )}
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