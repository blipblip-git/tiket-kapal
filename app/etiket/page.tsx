'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { cetakTiketThermal } from '@/lib/thermalPrinter'

type Pesanan = {
  id: string
  nama_penumpang: string
  nik: string
  nomor_hp: string | null
  kode_tiket: string
  status: string
  jadwal_id: string
  kursi_id: string
  kanal: string
  petugas_jual: string | null
  metode_bayar?: string
  nama_penjual_asli?: string
  is_balita: boolean
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
}

type TiketLengkap = {
  pesanan: Pesanan
  nomor_kursi: string
  qrUrl: string
}

function EtiketContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')

  const [tiketList, setTiketList] = useState<TiketLengkap[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesanShare, setPesanShare] = useState('')
  const [showShareMenu, setShowShareMenu] = useState<string | null>(null)
  const [activeTiketIndex, setActiveTiketIndex] = useState(0)

  const tiketRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  
  // STATE UNTUK HIDDEN RENDER
  const [renderData, setRenderData] = useState<TiketLengkap | null>(null)
  const renderRef = useRef<HTMLDivElement>(null)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShareMenu(null)
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.share-container')) {
        setShowShareMenu(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: p, error: errP } = await supabase
        .from('pesanan')
        .select('*')
        .in('id', pesananIds)

      if (errP || !p || p.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      const sorted = pesananIds
        .map((id) => p.find((x) => x.id === id))
        .filter((x): x is Pesanan => !!x)

      let detailJadwal: Detail | null = null
      if (sorted[0]) {
        const { data: j } = await supabase
          .from('jadwal')
          .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal_id')
          .eq('id', sorted[0].jadwal_id)
          .single()

        if (j) {
          let namaKapal = '-'
          if (j.kapal_id) {
            const { data: kap } = await supabase
              .from('kapal')
              .select('nama')
              .eq('id', j.kapal_id)
              .single()
            if (kap) namaKapal = kap.nama
          }
          detailJadwal = {
            rute_asal: j.rute_asal,
            rute_tujuan: j.rute_tujuan,
            tanggal: j.tanggal,
            jam_berangkat: j.jam_berangkat,
            harga: j.harga,
            nama_kapal: namaKapal,
          }
          setDetail(detailJadwal)
        }
      }

      const tiketLengkap: TiketLengkap[] = []
      for (const psn of sorted) {
        const { data: k } = await supabase
          .from('kursi')
          .select('nomor_kursi')
          .eq('id', psn.kursi_id)
          .single()

        const { data: pmb } = await supabase
          .from('pembayaran')
          .select('metode')
          .eq('pesanan_id', psn.id)
          .single()

        let namaPenjual = '-'
        if (psn.kanal === 'online') {
          namaPenjual = 'Online'
        } else if (psn.petugas_jual) {
          const { data: profilPenjual } = await supabase
            .from('profiles')
            .select('nama')
            .eq('email', psn.petugas_jual)
            .single()
          
          if (profilPenjual) {
            namaPenjual = profilPenjual.nama
          } else {
            namaPenjual = psn.petugas_jual.split('@')[0]
          }
        }

        const qrDataUrl = await QRCode.toDataURL(psn.kode_tiket, {
          width: 200,
          margin: 1,
        })

        tiketLengkap.push({
          pesanan: { 
            ...psn, 
            metode_bayar: pmb?.metode || 'cash_loket',
            nama_penjual_asli: namaPenjual
          },
          nomor_kursi: k?.nomor_kursi || '-',
          qrUrl: qrDataUrl,
        })
      }

      setTiketList(tiketLengkap)
      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FUNGSI SIMPAN PDF 1 FILE
  async function simpanPdfSatu(pesananId: string, namaPenumpang: string) {
    const ref = tiketRefs.current[pesananId]
    if (!ref) return
    try {
      const dataUrl = await toPng(ref, {
        quality: 0.85,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff',
        width: ref.clientWidth,
        height: ref.clientHeight,
      })
      const namaDepan = namaPenumpang.split(' ')[0]
      const img = new Image()
      img.src = dataUrl
      img.onload = () => {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [img.width, img.height] })
        pdf.addImage(dataUrl, 'JPEG', 0, 0, img.width, img.height)
        pdf.save(`${namaDepan}.pdf`)
        setPesanShare('PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
      }
    } catch (err) {
      console.error('Gagal generate gambar:', err)
    }
  }

  // FUNGSI SIMPAN SEMUA PDF PAKAI HIDDEN RENDER
  async function simpanSemuaPdf() {
    for (let i = 0; i < tiketList.length; i++) {
      const t = tiketList[i]
      setPesanShare(`Memproses tiket ${i + 1} dari ${tiketList.length}...`)
      
      setRenderData(t)
      
      await new Promise(r => setTimeout(r, 800))

      if (renderRef.current) {
        try {
          const dataUrl = await toPng(renderRef.current, {
            quality: 0.85,
            pixelRatio: 1.5,
            backgroundColor: '#ffffff',
            width: renderRef.current.clientWidth,
            height: renderRef.current.clientHeight,
          })
          
          const namaDepan = t.pesanan.nama_penumpang.split(' ')[0]
          const img = new Image()
          img.src = dataUrl
          await new Promise((resolve) => { img.onload = resolve })

          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [img.width, img.height] })
          pdf.addImage(dataUrl, 'JPEG', 0, 0, img.width, img.height)
          pdf.save(`${namaDepan}.pdf`)
        } catch (err) {
          console.error(`Gagal memproses tiket ${i + 1}`, err)
        }
      }

      await new Promise(r => setTimeout(r, 2000))
    }
    
    setRenderData(null)
    setPesanShare('Semua PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
  }

  async function shareKe(pesananId: string, kodeTiket: string) {
    setShowShareMenu(null)
    setPesanShare('Menyiapkan gambar untuk dibagikan...')
    
    const ref = tiketRefs.current[pesananId]
    if (!ref) return
    let dataUrl: string | null = null
    try {
      dataUrl = await toPng(ref, {
        quality: 0.85,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff',
        width: ref.clientWidth,
        height: ref.clientHeight,
      })
    } catch (err) {
      setPesanShare('Gagal membuat gambar tiket')
      return
    }

    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], `E-Tiket-${kodeTiket}.png`, { type: 'image/png' })

      const teksPesan = `E-Tiket Kapal Anda (Kode: ${kodeTiket}). Perlihatkan gambar ini ke petugas saat boarding.`

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'E-Tiket Kapal',
          text: teksPesan,
        })
        setPesanShare('Gambar tiket berhasil dibagikan. Cek di Galeri Foto atau WhatsApp.')
      } else {
        const link = document.createElement('a')
        link.download = `E-Tiket-${kodeTiket}.png`
        link.href = dataUrl
        link.click()
        setPesanShare('Gambar tiket berhasil diunduh. Cek di Galeri Foto HP Anda.')
      }
    } catch (err: any) {
      console.error(err)
      if (err.name !== 'AbortError') {
        setPesanShare('Gagal membagikan gambar: ' + err.message)
      }
    }
  }

  async function handleCetakThermal(t: TiketLengkap) {
    setPesanShare('Menghubungkan ke printer...')
    const result = await cetakTiketThermal({
      ...t.pesanan,
      jadwal: `${detail?.rute_asal} - ${detail?.rute_tujuan}`,
      kapal: detail?.nama_kapal || '-',
      jam: detail?.jam_berangkat || '00:00',
      tanggal: detail?.tanggal || '-',
      harga: t.pesanan.is_balita ? 0 : (detail?.harga || 0),
      kursi: t.nomor_kursi,
      petugas_nama: t.pesanan.nama_penjual_asli,
    })
    setPesanShare(result.message)
  }

  // FUNGSI KEMBALI (FIX ONLINE -> BERANDA)
  async function handleKembali() {
    const isOnline = tiketList[0]?.pesanan.kanal === 'online'
    
    // KALAU ONLINE, LANGSUNG KE BERANDA
    if (isOnline) {
      router.push('/')
      return
    }

    // KALAU OFFLINE (LOKET/AGEN), BALIK KE DASHBOARD MASING-MASING
    const sesi = getOperatorSession()
    if (sesi) {
      if (sesi.role === 'terminal_keberangkatan') {
        router.push('/dashboard/keberangkatan')
      } else if (sesi.role === 'agen') {
        router.push('/dashboard/agen')
      } else if (sesi.role === 'admin_utama') {
        router.push('/dashboard')
      } else {
        router.push('/dashboard/loket-menu')
      }
      return
    }

    router.push('/')
  }

  if (loading) return <p className="p-6 text-center text-gray-900 mt-10">Memuat e-tiket...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>
  if (tiketList.length === 0 || !detail) return <p className="p-6 text-center text-gray-900 mt-10">Data tidak lengkap</p>

  const isOnline = tiketList[0]?.pesanan.kanal === 'online'
  const t = tiketList[activeTiketIndex]

  const TiketCard = ({ tiket }: { tiket: TiketLengkap }) => {
    let labelMetode = 'Cash';
    if (tiket.pesanan.metode_bayar === 'simulasi_online' || tiket.pesanan.kanal === 'online') labelMetode = 'Qris';

    const hargaTampil = tiket.pesanan.is_balita ? 0 : (detail?.harga || 0)

    return (
      <div className="thermal-card p-3 md:p-6 text-gray-900 bg-white flex flex-col">
        <div className="text-center mb-2 md:mb-4">
          <p className="font-bold text-xs md:text-sm thermal-title">{tiket.pesanan.kode_tiket}</p>
        </div>
        
        <div className="flex justify-center mb-2 md:mb-4">
          <img src={tiket.qrUrl} alt="QR Code" className="w-28 h-28 md:w-40 md:h-40 thermal-qr object-contain" />
        </div>
        
        <div className="text-center mb-1 md:mb-2 font-bold text-xs md:text-sm">{detail?.rute_asal} - {detail?.rute_tujuan}</div>
        
        <hr className="my-2 md:my-4 border-dashed border-gray-300" />
        
        <div className="text-[11px] md:text-sm space-y-1 md:space-y-2 thermal-text">
          <div className="flex justify-between">
            <span className="text-gray-500">Nama / Kursi</span>
            <span className="font-bold text-gray-900 text-right">
              {tiket.pesanan.nama_penumpang} / {tiket.nomor_kursi}
              {tiket.pesanan.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Kapal</span>
            <span className="font-medium text-gray-900 text-right">{detail?.nama_kapal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tgl/Jam</span>
            <span className="font-medium text-gray-900">{detail?.tanggal}/{detail?.jam_berangkat.substring(0, 5)}</span>
          </div>
        </div>
        
        <hr className="my-2 md:my-4 border-dashed border-gray-300" />
        
        <div className="flex justify-between items-center thermal-text">
          <span className="font-bold text-gray-900 text-center w-full block text-xs md:text-sm">
            {tiket.pesanan.is_balita ? 'GRATIS (Balita)' : `${labelMetode} TOTAL: Rp ${hargaTampil.toLocaleString('id-ID')}`}
          </span>
        </div>
        
        <div className="mt-2 md:mt-4 text-center text-[9px] md:text-xs text-gray-400 border-t pt-1 md:pt-2 thermal-text">
          Perlihatkan e-tiket ke petugas<br/>
          Loket : {tiket.pesanan.nama_penjual_asli}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex flex-col overflow-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes heartbeat-pink {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
        }
        .animate-heartbeat-pink {
          animation: heartbeat-pink 1.5s infinite;
        }

        @keyframes heartbeat-blue {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        .animate-heartbeat-blue {
          animation: heartbeat-blue 1.5s infinite;
        }

        @media print {
          @page { 
            size: 58mm auto; 
            margin: 0; 
          }
          body { 
            margin: 0; 
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
          }
          .print-hidden { display: none !important; }
          
          body * { visibility: hidden; }
          .thermal-wrapper, .thermal-wrapper * { visibility: visible; }
          
          .thermal-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 5px;
          }

          .thermal-card {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      `}} />

      <div className="flex-shrink-0 bg-white shadow-sm z-10 px-3 py-2 md:px-6 md:py-4 print-hidden">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button onClick={handleKembali} className="text-blue-600 text-[11px] md:text-sm hover:underline font-medium bg-gray-50 px-2 py-1.5 md:px-3 md:py-1.5 rounded border border-gray-200">
            ← Halaman Utama
          </button>
          <div className="text-right">
            <h1 className="text-base md:text-xl font-bold text-gray-900">E-Tiket</h1>
            <p className="text-[10px] md:text-xs text-gray-600">Total {tiketList.length} tiket</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-24 print:pb-0">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-3 md:space-y-6">
          
          {pesanShare && (
            <p className="text-[10px] md:text-sm text-center text-gray-900 mb-2 bg-yellow-100 p-2 rounded print-hidden">{pesanShare}</p>
          )}

          {tiketList.length > 1 && (
            <div className="flex overflow-x-auto gap-1 pb-1 mb-2 print-hidden">
              {tiketList.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTiketIndex(i)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs md:text-sm rounded-t-lg font-medium transition-colors ${
                    activeTiketIndex === i 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  Tiket #{i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md overflow-hidden print:shadow-none print:border-none border border-gray-200 flex flex-col thermal-wrapper">
            <div className="bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-sm font-medium print-hidden text-center">
              Tiket #{activeTiketIndex + 1} dari {tiketList.length}
            </div>

            <div
              ref={(el) => {
                tiketRefs.current[t.pesanan.id] = el
              }}
              className="bg-white"
            >
              <TiketCard tiket={t} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 print-hidden relative">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-2">
          
          <div className="flex gap-2">
            {!isOnline && (
              <button
                onClick={() => handleCetakThermal(t)}
                className="w-full bg-orange-500 text-white py-2 md:py-2.5 rounded-md hover:bg-orange-600 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
              >
                Cetak Thermal
              </button>
            )}
            
            <button
              onClick={() => simpanPdfSatu(t.pesanan.id, t.pesanan.nama_penumpang)}
              className={`w-full bg-blue-600 text-white py-2 md:py-2.5 rounded-md hover:bg-blue-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors ${
                tiketList.length === 1 ? 'animate-heartbeat-blue' : ''
              }`}
            >
              Simpan PDF
            </button>
          </div>

          {tiketList.length > 1 && (
            <button
              onClick={simpanSemuaPdf}
              className="w-full bg-pink-500 text-white py-2 md:py-2.5 rounded-md hover:bg-pink-600 text-[11px] md:text-sm font-bold shadow-sm transition-colors animate-heartbeat-pink"
            >
              Simpan Semua Tiket ({tiketList.length})
            </button>
          )}

          <div className="relative share-container">
            <button
              onClick={() => setShowShareMenu(showShareMenu === t.pesanan.id ? null : t.pesanan.id)}
              className="w-full bg-green-600 text-white py-2 md:py-2.5 rounded-md hover:bg-green-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
            >
              Share / Kirim Tiket
            </button>

            {showShareMenu === t.pesanan.id && (
              <div className="absolute bottom-12 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50 flex justify-center">
                <button onClick={() => shareKe(t.pesanan.id, t.pesanan.kode_tiket)} className="flex flex-col items-center p-2 hover:bg-gray-50 rounded w-full">
                  <span className="text-[10px] md:text-xs font-medium text-gray-700">Bagikan Gambar (WA/TG)</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ================= KOTAK RAHASIA UNTUK HIDDEN RENDER ================= */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {renderData && (
          <div 
            ref={renderRef}
            className="bg-white" 
            style={{ width: '350px' }}
          >
            <TiketCard tiket={renderData} />
          </div>
        )}
      </div>

    </div>
  )
}

export default function EtiketPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-900 mt-10">Memuat...</p>}>
      <EtiketContent />
    </Suspense>
  )
}