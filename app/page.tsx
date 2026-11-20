'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Cadangan kalau tabel master_kota belum bisa dibaca.
type KotaRute = { nama_kota: string; singkatan: string }

const DAFTAR_KOTA_CADANGAN: KotaRute[] = [
  { nama_kota: 'Berau', singkatan: 'BRU' },
  { nama_kota: 'Bunyu', singkatan: 'BNY' },
  { nama_kota: 'Kabupaten Tanah Tidung', singkatan: 'KTT' },
  { nama_kota: 'Malinau', singkatan: 'MLN' },
  { nama_kota: 'Nunukan', singkatan: 'NNK' },
  { nama_kota: 'Sebatik', singkatan: 'SBK' },
  { nama_kota: 'Sembakung', singkatan: 'SMG' },
  { nama_kota: 'Sungai Nyamuk', singkatan: 'SNK' },
  { nama_kota: 'Tanah Kuning', singkatan: 'TKG' },
  { nama_kota: 'Tanjung Selor', singkatan: 'TJS' },
  { nama_kota: 'Tarakan', singkatan: 'TRK' }
]

// Koordinat pusat kota (perkiraan) untuk deteksi otomatis kolom "Dari".
// Kota yang tidak ada di sini hanya tidak ikut terdeteksi (tetap bisa dipilih manual).
const KOORDINAT_KOTA: Record<string, { lat: number; lng: number }> = {
  'Berau': { lat: 2.1531, lng: 117.4957 },
  'Bunyu': { lat: 3.5200, lng: 117.8069 },
  'Kabupaten Tanah Tidung': { lat: 3.5855, lng: 116.9078 },
  'Malinau': { lat: 3.5892, lng: 116.6222 },
  'Nunukan': { lat: 4.1404, lng: 117.6511 },
  'Sebatik': { lat: 4.1333, lng: 117.7667 },
  'Sembakung': { lat: 3.8569, lng: 117.0318 },
  'Sungai Nyamuk': { lat: 4.1426, lng: 117.9117 },
  'Tanah Kuning': { lat: 2.6027, lng: 117.8172 },
  'Tanjung Selor': { lat: 2.8430, lng: 117.3613 },
  'Tarakan': { lat: 3.3000, lng: 117.6330 }
}

// Kalau lokasi pembeli lebih jauh dari radius ini dari semua kota, kolom "Dari" dibiarkan kosong.
const RADIUS_DETEKSI_KM = 25

function jarakKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function BerandaContent() {
  const router = useRouter()
  
  const [asal, setAsal] = useState('')
  const [tujuan, setTujuan] = useState('')
  const [tanggal, setTanggal] = useState('')
  
  const [showAsalModal, setShowAsalModal] = useState(false)
  const [showTujuanModal, setShowTujuanModal] = useState(false)
  const [searchAsal, setSearchAsal] = useState('')
  const [searchTujuan, setSearchTujuan] = useState('')

  // LOGIKA PINTU RAHASIA (KLIK 3X TULISAN LINTASAIR -> LOGIN PETUGAS)
  const klikCount = useRef(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleJudulKlik = () => {
    klikCount.current += 1

    if (timerRef.current) clearTimeout(timerRef.current)

    if (klikCount.current === 3) {
      klikCount.current = 0
      router.push('/login')
    } else {
      timerRef.current = setTimeout(() => {
        klikCount.current = 0
      }, 1000)
    }
  }

  const [daftarKota, setDaftarKota] = useState<KotaRute[]>(DAFTAR_KOTA_CADANGAN)
  const [memuatRute, setMemuatRute] = useState(false)
  const [deteksiLokasi, setDeteksiLokasi] = useState('')

  // Dipakai supaya deteksi lokasi tidak menimpa pilihan manual pembeli.
  const asalRef = useRef('')
  const sudahDeteksi = useRef(false)

  useEffect(() => {
    asalRef.current = asal
  }, [asal])

  // Rute online WAJIB sama persis dengan Master Rute (master_kota), karena
  // template jadwal menyimpan rute_asal/tujuan memakai nama_kota.
  const muatRute = async () => {
    setMemuatRute(true)
    try {
      const { data } = await supabase
        .from('master_kota')
        .select('nama_kota, singkatan')
        .order('nama_kota')

      if (data && data.length > 0) {
        const unik = new Map<string, KotaRute>()
        data.forEach((k: any) => {
          const nama = (k.nama_kota || '').trim()
          if (!nama || unik.has(nama)) return
          unik.set(nama, { nama_kota: nama, singkatan: (k.singkatan || '').trim() })
        })
        const hasil = Array.from(unik.values()).sort((a, b) => a.nama_kota.localeCompare(b.nama_kota))
        if (hasil.length > 0) setDaftarKota(hasil)
      }
    } finally {
      setMemuatRute(false)
    }
  }

  useEffect(() => {
    muatRute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // DETEKSI LOKASI OTOMATIS -> isi kolom "Dari" dengan kota terdekat.
  // Kalau pembeli menolak izin lokasi, kolom tetap "-- Pilih Kota --".
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return
    if (daftarKota.length === 0) return
    if (sudahDeteksi.current) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (sudahDeteksi.current) return
        sudahDeteksi.current = true
        if (asalRef.current) return

        let kandidat = ''
        let jarakTerdekat = Number.POSITIVE_INFINITY

        daftarKota.forEach((kota) => {
          const koord = KOORDINAT_KOTA[kota.nama_kota]
          if (!koord) return
          const jarak = jarakKm(pos.coords.latitude, pos.coords.longitude, koord.lat, koord.lng)
          if (jarak < jarakTerdekat) {
            jarakTerdekat = jarak
            kandidat = kota.nama_kota
          }
        })

        if (kandidat && jarakTerdekat <= RADIUS_DETEKSI_KM) {
          setAsal(kandidat)
          setDeteksiLokasi(kandidat)
        }
      },
      () => {
        sudahDeteksi.current = true
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    )
  }, [daftarKota])

  // LOGIKA RESET TANGGAL JAM 16.00 WITA
  const getTanggalDefault = () => {
    const now = new Date()
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    let targetDate = witaTime
    
    // Jika jam 16.00 WITA atau lebih, otomatis maju ke besok
    if (witaTime.getUTCHours() >= 16) {
      targetDate = new Date(witaTime.getTime() + (24 * 60 * 60 * 1000))
    }
    return targetDate.toISOString().split('T')[0]
  }

  useEffect(() => {
    setTanggal(getTanggalDefault())
  }, [])

  const handleTukar = () => {
    const temp = asal
    setAsal(tujuan)
    setTujuan(temp)
    setDeteksiLokasi('')
  }

  // TOMBOL REFRESH: bersihkan pilihan kembali ke default + muat ulang master rute.
  const handleRefresh = () => {
    setAsal('')
    setTujuan('')
    setSearchAsal('')
    setSearchTujuan('')
    setShowAsalModal(false)
    setShowTujuanModal(false)
    setDeteksiLokasi('')
    setTanggal(getTanggalDefault())
    sudahDeteksi.current = true
    muatRute()
  }

  const handleCari = (e: React.FormEvent) => {
    e.preventDefault()
    if (!asal || !tujuan || !tanggal) {
      alert('Mohon lengkapi Kota Asal, Tujuan, dan Tanggal.')
      return
    }
    if (asal === tujuan) {
      alert('Kota Asal dan Tujuan tidak boleh sama.')
      return
    }
    
    router.push(`/pilih-jadwal?asal=${encodeURIComponent(asal)}&tujuan=${encodeURIComponent(tujuan)}&tanggal=${tanggal}`)
  }

  const handlePilihKota = (kota: string, tipe: 'asal' | 'tujuan') => {
    if (tipe === 'asal') {
      setAsal(kota)
      setDeteksiLokasi('')
      setShowAsalModal(false)
      setSearchAsal('')
      if (kota === tujuan) setTujuan('')
    } else {
      setTujuan(kota)
      setShowTujuanModal(false)
      setSearchTujuan('')
      if (kota === asal) setAsal('')
    }
  }

  const labelKota = (nama: string) => {
    const kota = daftarKota.find(k => k.nama_kota === nama)
    return kota?.singkatan ? `${kota.nama_kota} / ${kota.singkatan}` : nama
  }

  const filterKota = (search: string) => {
    const q = search.trim().toLowerCase()
    if (!q) return daftarKota
    return daftarKota.filter(k =>
      k.nama_kota.toLowerCase().includes(q) || k.singkatan.toLowerCase().includes(q)
    )
  }

  return (
    <div className="min-h-[100dvh] w-full bg-purple-700 flex flex-col items-center py-6 sm:py-8 px-3 sm:px-4 overflow-x-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes heartbeat {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          50% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .animate-heartbeat {
          animation: heartbeat 1.5s infinite;
        }

        /* Animasi Cenut-cenut (Tanpa Glow) */
        @keyframes cenut-cenut {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .dot-cenut {
          animation: cenut-cenut 1.2s infinite ease-in-out;
        }
        .dot-delay-1 { animation-delay: 0s; }
        .dot-delay-2 { animation-delay: 0.2s; }
        .dot-delay-3 { animation-delay: 0.4s; }
        .dot-delay-4 { animation-delay: 0.6s; }
        .dot-delay-5 { animation-delay: 0.8s; }
        .dot-delay-6 { animation-delay: 1.0s; }
      `}} />

      <div 
        onClick={handleJudulKlik}
        className="bg-white rounded-3xl shadow-lg w-full max-w-[340px] sm:max-w-sm py-5 sm:py-6 px-4 text-center mb-5 sm:mb-6 cursor-pointer select-none"
      >
        <h1 className="text-3xl sm:text-4xl font-serif text-gray-900 tracking-wide">LintasAir</h1>
        <div className="flex justify-center gap-1.5 mt-2 sm:mt-3">
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500 dot-cenut dot-delay-1"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-yellow-400 dot-cenut dot-delay-2"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-green-500 dot-cenut dot-delay-3"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-blue-500 dot-cenut dot-delay-4"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-purple-500 dot-cenut dot-delay-5"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-pink-500 dot-cenut dot-delay-6"></span>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-lg w-full max-w-[340px] sm:max-w-sm p-5 sm:p-6 relative">
        <div className="relative flex items-center justify-center mb-5 sm:mb-6 min-h-[34px]">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 text-center">Cari Tiket Speed</h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={memuatRute}
            title="Bersihkan pilihan & muat ulang rute"
            aria-label="Bersihkan pilihan dan muat ulang rute"
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 sm:px-2.5 py-1.5 hover:bg-purple-100 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${memuatRute ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.9-3M4 16a8 8 0 0014.9 3" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <form onSubmit={handleCari} className="space-y-3 sm:space-y-4">

          {/* Blok "Dari" + "Ke" dibungkus satu wrapper: tombol tukar dipasang absolute
              supaya tidak menambah tinggi baris (jarak antar baris jadi seragam) dan
              lingkarannya pas di tengah antara kotak Dari dan kotak Ke. */}
          <div className="relative">
            <div className="space-y-3 sm:space-y-4">

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700">Dari</label>
                  {deteksiLokasi && (
                    <span
                      title="Terdeteksi otomatis dari lokasi Anda (bisa diubah)"
                      className="text-[10px] font-medium text-green-700 flex items-center gap-1"
                    >
                      <span>📍</span>
                      <span>Terdeteksi otomatis</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAsalModal(true)}
                  className="w-full text-left border border-gray-300 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 focus:ring-purple-500 focus:border-purple-500 bg-white"
                >
                  {asal ? labelKota(asal) : '-- Pilih Kota --'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ke</label>
                <button
                  type="button"
                  onClick={() => setShowTujuanModal(true)}
                  className="w-full text-left border border-gray-300 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 focus:ring-purple-500 focus:border-purple-500 bg-white"
                >
                  {tujuan ? labelKota(tujuan) : '-- Pilih Kota --'}
                </button>
              </div>

            </div>

            {/* top = 50% + 12px (setengah tinggi label "Ke": 20px + mb-1 4px) */}
            <button
              type="button"
              onClick={handleTukar}
              title="Tukar kota asal & tujuan"
              aria-label="Tukar kota asal dan tujuan"
              className="absolute left-1/2 top-[calc(50%+12px)] -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-white border border-gray-200 rounded-full shadow-md text-gray-600 hover:text-purple-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 focus:ring-purple-500 focus:border-purple-500 bg-white"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base hover:bg-purple-700 shadow-md transition-colors"
          >
            Cari Jadwal
          </button>
        </form>

        <div className="mt-4 sm:mt-5 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] sm:text-xs text-gray-500 mb-2">Lupa atau belum cetak e-tiket?</p>
          <button
            onClick={() => router.push('/cek-tiket')}
            className="w-full bg-gray-50 text-gray-700 py-2 sm:py-2.5 rounded-lg font-medium text-xs sm:text-sm border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            Cek Transaksi / Tiket Anda
          </button>
        </div>
      </div>

      {showAsalModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-3 border-b bg-gray-50">
              <input
                type="text"
                autoFocus
                placeholder="Cari kota..."
                value={searchAsal}
                onChange={(e) => setSearchAsal(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="overflow-y-auto p-2">
              {filterKota(searchAsal).map(kota => {
                const isSelected = asal === kota.nama_kota;
                const isDisabled = tujuan === kota.nama_kota; 
                
                return (
                  <button
                    key={kota.nama_kota}
                    disabled={isDisabled}
                    onClick={() => handlePilihKota(kota.nama_kota, 'asal')}
                    className={`w-full text-left px-4 py-3 rounded-lg mb-1 flex items-center justify-between transition-all ${
                      isDisabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {kota.nama_kota} <span className="text-gray-500">/ {kota.singkatan}</span>
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected 
                        ? 'border-red-500 bg-red-500 animate-heartbeat' 
                        : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-3 border-t bg-gray-50 flex items-center justify-center gap-3">
              <button
                onClick={muatRute}
                disabled={memuatRute}
                className="text-sm text-purple-600 font-bold hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                <svg className={`w-4 h-4 ${memuatRute ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.9-3M4 16a8 8 0 0014.9 3" />
                </svg>
                Muat Ulang Rute
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setShowAsalModal(false)} className="text-sm text-gray-600 font-medium hover:underline">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {showTujuanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-3 border-b bg-gray-50">
              <input
                type="text"
                autoFocus
                placeholder="Cari kota..."
                value={searchTujuan}
                onChange={(e) => setSearchTujuan(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="overflow-y-auto p-2">
              {filterKota(searchTujuan).map(kota => {
                const isSelected = tujuan === kota.nama_kota;
                const isDisabled = asal === kota.nama_kota; 
                
                return (
                  <button
                    key={kota.nama_kota}
                    disabled={isDisabled}
                    onClick={() => handlePilihKota(kota.nama_kota, 'tujuan')}
                    className={`w-full text-left px-4 py-3 rounded-lg mb-1 flex items-center justify-between transition-all ${
                      isDisabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {kota.nama_kota} <span className="text-gray-500">/ {kota.singkatan}</span>
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected 
                        ? 'border-red-500 bg-red-500 animate-heartbeat' 
                        : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-3 border-t bg-gray-50 flex items-center justify-center gap-3">
              <button
                onClick={muatRute}
                disabled={memuatRute}
                className="text-sm text-purple-600 font-bold hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                <svg className={`w-4 h-4 ${memuatRute ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.9-3M4 16a8 8 0 0014.9 3" />
                </svg>
                Muat Ulang Rute
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setShowTujuanModal(false)} className="text-sm text-gray-600 font-medium hover:underline">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function BerandaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-900">Memuat...</div>}>
      <BerandaContent />
    </Suspense>
  )
}