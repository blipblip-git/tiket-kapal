'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'

function BerandaContent() {
  const router = useRouter()
  
  const [asal, setAsal] = useState('')
  const [tujuan, setTujuan] = useState('')
  const [tanggal, setTanggal] = useState('')
  
  const [showAsalModal, setShowAsalModal] = useState(false)
  const [showTujuanModal, setShowTujuanModal] = useState(false)
  const [searchAsal, setSearchAsal] = useState('')
  const [searchTujuan, setSearchTujuan] = useState('')

  // LOGIKA PINTU RAHASIA SUPERADMIN (KLIK 3X)
  const klikCount = useRef(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleTombolCariKlik = (e: React.MouseEvent) => {
    klikCount.current += 1

    if (timerRef.current) clearTimeout(timerRef.current)

    if (klikCount.current === 3) {
      e.preventDefault() // Cegah form submit saat klik ke-3
      klikCount.current = 0
      router.push('/superadmin')
    } else {
      timerRef.current = setTimeout(() => {
        klikCount.current = 0
      }, 1000)
    }
  }

  const daftarKota = [
    'Tarakan',
    'Tanjung Selor',
    'Nunukan',
    'Malinau',
    'Bunyu',
    'KTT',
    'Tana Kuning',
    'Sungai Nyamuk'
  ]

  useEffect(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0]
    setTanggal(localDate)
  }, [])

  const handleTukar = () => {
    const temp = asal
    setAsal(tujuan)
    setTujuan(temp)
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

  const filterKota = (search: string) => {
    return daftarKota.filter(k => k.toLowerCase().includes(search.toLowerCase()))
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
      `}} />

      <div className="bg-white rounded-3xl shadow-lg w-full max-w-[340px] sm:max-w-sm py-5 sm:py-6 px-4 text-center mb-5 sm:mb-6">
        <h1 className="text-3xl sm:text-4xl font-serif text-gray-900 tracking-wide">tempakul</h1>
        <div className="flex justify-center gap-1.5 mt-2 sm:mt-3">
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-yellow-400"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-green-500"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-blue-500"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-purple-500"></span>
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-pink-500"></span>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-lg w-full max-w-[340px] sm:max-w-sm p-5 sm:p-6 relative">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 text-center mb-5 sm:mb-6">Cari Jadwal Tiket Speed</h2>

        <form onSubmit={handleCari} className="space-y-3 sm:space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dari</label>
            <button
              type="button"
              onClick={() => setShowAsalModal(true)}
              className="w-full text-left border border-gray-300 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 focus:ring-purple-500 focus:border-purple-500 bg-white"
            >
              {asal || '-- Pilih Kota --'}
            </button>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <button 
              type="button" 
              onClick={handleTukar}
              className="bg-white border border-gray-200 p-2 rounded-full shadow-md text-gray-600 hover:text-purple-600 transition-colors"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ke</label>
            <button
              type="button"
              onClick={() => setShowTujuanModal(true)}
              className="w-full text-left border border-gray-300 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 focus:ring-purple-500 focus:border-purple-500 bg-white"
            >
              {tujuan || '-- Pilih Kota --'}
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
            onClick={handleTombolCariKlik}
            className="w-full bg-purple-600 text-white py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base hover:bg-purple-700 shadow-md transition-colors mt-2"
          >
            Cari Jadwal
          </button>
        </form>

        <div className="mt-5 sm:mt-6 pt-4 border-t border-gray-100 text-center">
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
                const isSelected = asal === kota;
                const isDisabled = tujuan === kota; 
                
                return (
                  <button
                    key={kota}
                    disabled={isDisabled}
                    onClick={() => handlePilihKota(kota, 'asal')}
                    className={`w-full text-left px-4 py-3 rounded-lg mb-1 flex items-center justify-between transition-all ${
                      isDisabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{kota}</span>
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
            <div className="p-3 border-t bg-gray-50 text-center">
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
                const isSelected = tujuan === kota;
                const isDisabled = asal === kota; 
                
                return (
                  <button
                    key={kota}
                    disabled={isDisabled}
                    onClick={() => handlePilihKota(kota, 'tujuan')}
                    className={`w-full text-left px-4 py-3 rounded-lg mb-1 flex items-center justify-between transition-all ${
                      isDisabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{kota}</span>
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
            <div className="p-3 border-t bg-gray-50 text-center">
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