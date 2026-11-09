'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile } from '@/lib/supabase'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import { cetakTiketThermal } from '@/lib/thermalPrinter'

type HasilPencarian = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  kanal: string
  kursi: string
  jadwal: string
  kapal: string
  tanggal: string
  jam: string
  harga: number
}

function CetakUlangContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [hasil, setHasil] = useState<HasilPencarian[]>([])
  const [sedangCari, setSedangCari] = useState(false)
  const [pesan, setPesan] = useState('')
  
  const [detailPilih, setDetailPilih] = useState<HasilPencarian | null>(null)
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    async function init() {
      const sesi = getOperatorSession()
      if (!sesi) {
        const admin = await getProfile()
        if (!admin || admin.role !== 'admin_utama') {
          router.push('/login')
          return
        }
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function handleCari(e: React.FormEvent) {
    e.preventDefault()
    if (!keyword) return
    setSedangCari(true)
    setPesan('')
    setHasil([])
    setDetailPilih(null)

    const { data, error } = await supabase
      .from('pesanan')
      .select(`
        id, nama_penumpang, kode_tiket, kanal,
        jadwal:jadwal_id (rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal:kapal_id(nama)),
        kursi:kursi_id (nomor_kursi)
      `)
      .or(`nama_penumpang.ilike.%${keyword}%,kode_tiket.eq.${keyword}`)
      .eq('status', 'paid')

    if (error) {
      setPesan('Gagal mencari: ' + error.message)
      setSedangCari(false)
      return
    }

    if (data && data.length > 0) {
      const mapped = data.map((item: any) => ({
        id: item.id,
        nama_penumpang: item.nama_penumpang,
        kode_tiket: item.kode_tiket,
        kanal: item.kanal,
        kursi: item.kursi?.nomor_kursi || '-',
        jadwal: `${item.jadwal?.rute_asal} - ${item.jadwal?.rute_tujuan}`,
        kapal: item.jadwal?.kapal?.nama || '-',
        tanggal: item.jadwal?.tanggal || '-',
        jam: item.jadwal?.jam_berangkat || '-',
        harga: item.jadwal?.harga || 0,
      }))
      setHasil(mapped)
    } else {
      setPesan('Tiket tidak ditemukan.')
    }
    setSedangCari(false)
  }

  async function handlePilih(tiket: HasilPencarian) {
    setDetailPilih(tiket)
    setQrUrl('') 
    const qr = await QRCode.toDataURL(tiket.kode_tiket, { width: 300, margin: 2 })
    setQrUrl(qr)
  }

  async function handleSimpan() {
    if (!detailPilih) return
    setPesan('Menyiapkan gambar...')
    
    const el = document.getElementById('area-tiket-ulang')
    if (el) {
      try {
        const dataUrl = await toPng(el, { quality: 0.85, pixelRatio: 1.5, backgroundColor: '#ffffff' })
        const link = document.createElement('a')
        link.download = `${detailPilih.nama_penumpang.split(' ')[0]}.png`
        link.href = dataUrl
        link.click()
        setPesan('Berhasil diunduh.')
      } catch (err) {
        setPesan('Gagal mengunduh gambar.')
      }
    }
  }

  async function handlePrintThermal() {
    if (!detailPilih) return
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    if (isMobile) {
      setPesan('Menghubungkan ke printer Bluetooth...')
      const result = await cetakTiketThermal(detailPilih)
      setPesan(result.message)
    } else {
      setPesan('Menyiapkan format cetak thermal untuk Laptop...')
      setTimeout(() => {
        window.print()
        setPesan('')
      }, 500)
    }
  }

  function handleKembali() {
    const sesi = getOperatorSession()
    if (sesi) {
      if (sesi.role === 'terminal_keberangkatan') router.push('/dashboard/keberangkatan')
      else if (sesi.role === 'agen') router.push('/dashboard/agen')
      else router.push('/dashboard/loket-menu')
    } else {
      router.push('/dashboard')
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>

  const sesi = getOperatorSession()
  const isAgenAtauKeberangkatan = sesi?.role === 'agen' || sesi?.role === 'terminal_keberangkatan'

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:bg-white print:block">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: 58mm auto; margin: 0; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
          .print-hidden { display: none !important; }
          
          body * { visibility: hidden; }
          #area-tiket-ulang, #area-tiket-ulang * { visibility: visible; }
          
          #area-tiket-ulang { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            margin: 0;
            padding: 5px; 
            border: none !important; 
            box-shadow: none !important; 
          }
        }
      `}} />

      <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3 md:py-4 print-hidden">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">Cetak Ulang Tiket</h1>
          <button onClick={handleKembali} className="text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
            &larr; Kembali
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full p-4 print:hidden">
        <div className="max-w-md mx-auto space-y-4">
          
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
            <form onSubmit={handleCari} className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Cari berdasarkan Nama atau Kode..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 min-w-0"
              />
              <button type="submit" disabled={sedangCari} className="bg-blue-600 text-white px-4 py-2 rounded-md font-bold text-sm hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap transition-colors">
                {sedangCari ? '...' : 'Cari'}
              </button>
            </form>
            {pesan && <p className="text-xs mt-2 text-blue-600 font-medium">{pesan}</p>}
          </div>

          {hasil.length > 0 && !detailPilih && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {hasil.map((h) => (
                  <div key={h.id} className="p-3 hover:bg-gray-50 transition flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">{h.nama_penumpang}</p>
                      <p className="text-[10px] text-gray-600 font-mono truncate">{h.kode_tiket}</p>
                      <p className="text-[10px] text-gray-600 truncate">{h.jadwal}</p>
                    </div>
                    <button onClick={() => handlePilih(h)} className="flex-shrink-0 text-xs bg-blue-50 text-blue-700 font-bold px-3 py-1.5 rounded hover:bg-blue-100 transition">
                      Lihat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detailPilih && (
            <div className="flex flex-col items-center">
              <div className="w-full flex justify-between mb-3">
                <button onClick={() => setDetailPilih(null)} className="text-xs text-gray-600 hover:underline font-medium">
                  &larr; Kembali ke Hasil
                </button>
                
                {isAgenAtauKeberangkatan ? (
                  <button onClick={handlePrintThermal} className="bg-blue-600 text-white px-3 py-1.5 rounded-md font-bold text-xs hover:bg-blue-700 shadow-sm flex items-center gap-1">
                    🖨️ Cetak Thermal
                  </button>
                ) : (
                  detailPilih.kanal === 'online' ? (
                    <button onClick={handleSimpan} className="bg-green-600 text-white px-3 py-1.5 rounded-md font-bold text-xs hover:bg-green-700 shadow-sm">
                      📥 Simpan Tiket
                    </button>
                  ) : (
                    <button onClick={handlePrintThermal} className="bg-blue-600 text-white px-3 py-1.5 rounded-md font-bold text-xs hover:bg-blue-700 shadow-sm flex items-center gap-1">
                      🖨️ Cetak Thermal
                    </button>
                  )
                )}
              </div>

              <div id="area-tiket-ulang" className="bg-white rounded-lg shadow-md p-4 md:p-6 text-gray-900 w-full border border-gray-200 print:shadow-none print:p-0 print:border-none">
                <div className="text-center mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kode Tiket</p>
                  <p className="font-bold text-sm">{detailPilih.kode_tiket}</p>
                </div>
                
                <div className="flex justify-center mb-3">
                  {qrUrl ? (
                    <img src={qrUrl} alt="QR" className="w-32 h-32 md:w-40 md:h-40 object-contain" />
                  ) : (
                    <div className="w-32 h-32 md:w-40 md:h-40 bg-gray-100 animate-pulse rounded-md flex items-center justify-center text-xs text-gray-400">
                      Memuat QR...
                    </div>
                  )}
                </div>

                <hr className="my-3 border-dashed border-gray-300" />
                
                <div className="text-[11px] md:text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Nama</span>
                    <span className="font-bold text-gray-900 text-right">{detailPilih.nama_penumpang}</span>
                  </div>
                  {/* BARIS NIK DIHAPUS DI SINI */}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kapal</span>
                    <span className="font-medium text-gray-900 text-right">{detailPilih.kapal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rute</span>
                    <span className="font-medium text-gray-900 text-right">{detailPilih.jadwal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tgl / Jam</span>
                    <span className="font-medium text-gray-900">{detailPilih.tanggal} / {detailPilih.jam.substring(0,5)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50 p-2 rounded -mx-2 mt-2">
                    <span className="text-blue-800 font-bold text-xs">Kursi</span>
                    <span className="font-bold text-blue-700 text-lg">{detailPilih.kursi}</span>
                  </div>
                </div>
                
                <hr className="my-3 border-dashed border-gray-300" />
                
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-xs md:text-sm">Total Bayar</span>
                  <span className="font-bold text-gray-900 text-sm md:text-lg">Rp {detailPilih.harga.toLocaleString('id-ID')}</span>
                </div>
                
                <div className="mt-3 text-center text-[9px] md:text-xs text-gray-400 border-t pt-2">
                  Tunjukkan e-tiket ini ke petugas saat boarding.
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function CetakUlangPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <CetakUlangContent />
    </Suspense>
  )
}