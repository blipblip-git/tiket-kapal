'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'

type PesananItem = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  status: string
  jadwal_id: string
  kursi_id: string | null
  is_balita: boolean
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
}

function PembayaranContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')

  const [pesananList, setPesananList] = useState<PesananItem[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sedangBayar, setSedangBayar] = useState(false)
  const [step, setStep] = useState<'pilih' | 'qris'>('pilih')

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      try {
        const { data: p, error: errP } = await supabase
          .from('pesanan')
          .select('id, nama_penumpang, kode_tiket, status, jadwal_id, kursi_id, is_balita')
          .in('id', pesananIds)

        if (errP) throw errP
        if (!p || p.length === 0) {
          setError('Data pesanan tidak ditemukan di database.')
          setLoading(false)
          return
        }

        // PENGAMAN: Jika pesanan sudah dibayar, tendang ke e-tiket atau beranda
        const sudahDibayar = p.every(item => item.status === 'paid')
        if (sudahDibayar) {
          router.replace(`/etiket?pesanan=${pesananIds.join(',')}`)
          return
        }

        const sorted = pesananIds
          .map((id) => p.find((x) => x.id === id))
          .filter((x): x is PesananItem => !!x)

        setPesananList(sorted)

        if (sorted[0]) {
          const { data: j, error: errJ } = await supabase
            .from('jadwal')
            .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga')
            .eq('id', sorted[0].jadwal_id)
            .single()

          if (errJ) throw errJ
          if (j) setDetail(j)
        }
      } catch (err: any) {
        console.error(err)
        setError('Gagal memuat data: ' + (err.message || 'Kesalahan tidak diketahui'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [pesananIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBatal() {
    if (pesananList.length === 0) return
    const ids = pesananList.map(p => p.id)
    const kursiIds = pesananList.map(p => p.kursi_id).filter(Boolean) as string[]

    await supabase.from('pesanan').delete().in('id', ids)
    
    if (kursiIds.length > 0) {
      await supabase.from('kursi').update({ status: 'kosong', waktu_hold: null }).in('id', kursiIds)
    }

    const sesi = getOperatorSession()
    if (sesi) {
      router.push('/dashboard/loket')
    } else {
      router.push('/')
    }
  }

  async function handleBayarOnline() {
    if (pesananList.length === 0 || !detail || sedangBayar) return
    setSedangBayar(true)
    setError('')

    const waktuBayar = new Date().toISOString()
    const ids = pesananList.map((p) => p.id)

    try {
      console.log('1. Mulai update pesanan', ids)
      const { error: errP } = await supabase
        .from('pesanan')
        .update({
          status: 'paid',
          waktu_bayar: waktuBayar,
          kanal: 'online',
        })
        .in('id', ids)

      if (errP) throw new Error('Gagal update pesanan: ' + errP.message)
      console.log('2. Selesai update pesanan')

      const kursiIds = pesananList.map((p) => p.kursi_id).filter(Boolean) as string[]
      if (kursiIds.length > 0) {
        const { error: errK } = await supabase
          .from('kursi')
          .update({ status: 'terisi', waktu_hold: null })
          .in('id', kursiIds)

        if (errK) throw new Error('Gagal update kursi: ' + errK.message)
      }
      console.log('4. Selesai update kursi')

      const pesananDewasa = pesananList.filter(p => !p.is_balita)
      const pembayaranData = pesananDewasa.map((p) => ({
        pesanan_id: p.id,
        metode: 'simulasi_online',
        jumlah: detail.harga,
        status: 'sukses',
        waktu_bayar: waktuBayar,
      }))
      
      if (pembayaranData.length > 0) {
        const { error: errPay } = await supabase.from('pembayaran').insert(pembayaranData)
        if (errPay) throw new Error('Gagal simpan pembayaran: ' + errPay.message)
      }
      console.log('6. Selesai insert pembayaran')

      // Gunakan router.replace agar halaman pembayaran tidak masuk history browser
      router.replace(`/etiket?pesanan=${ids.join(',')}`)
    } catch (err: any) {
      console.error('Error di handleBayarOnline:', err)
      setError(err.message || 'Terjadi kesalahan saat memproses pembayaran.')
      setSedangBayar(false)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-900 mt-10">Memuat data pembayaran...</p>
  if (error && !detail) return <p className="p-6 text-center text-red-600 font-bold mt-10">Error: {error}</p>
  if (pesananList.length === 0 || !detail) return <p className="p-6 text-center text-gray-900 mt-10">Data pesanan tidak lengkap.</p>

  const jumlahDewasa = pesananList.filter(p => !p.is_balita).length
  const totalHarga = detail.harga * jumlahDewasa

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex flex-col overflow-hidden">
      
      <div className="flex-shrink-0 bg-white shadow-sm z-10 px-4 py-3 md:py-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Pembayaran</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-3 md:space-y-4 pb-6">
          
          <div className="bg-white p-4 md:p-5 rounded-lg shadow-sm text-gray-900 border border-gray-200">
            <h2 className="font-bold mb-2 text-sm md:text-base text-gray-900">Detail Pesanan</h2>
            <div className="text-[11px] md:text-sm space-y-1.5 md:space-y-2 mb-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Rute</span>
                <span className="font-medium text-gray-900">{detail.rute_asal} → {detail.rute_tujuan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tanggal</span>
                <span className="font-medium text-gray-900">{detail.tanggal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Jam</span>
                <span className="font-medium text-gray-900">{detail.jam_berangkat}</span>
              </div>
            </div>
            
            <hr className="my-2 md:my-3 border-gray-200" />
            
            <p className="font-bold text-gray-900 mb-1.5 text-xs md:text-sm">Daftar Penumpang ({pesananList.length} orang)</p>
            <div className="space-y-1 mb-2 md:mb-3 max-h-[100px] md:max-h-[150px] overflow-y-auto pr-1">
              {pesananList.map((p, idx) => (
                <div key={p.id} className="flex justify-between text-[11px] md:text-sm">
                  <span className="text-gray-900 truncate pr-2">
                    {idx + 1}. {p.nama_penumpang}
                    {p.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
                  </span>
                  <span className="text-[10px] md:text-xs text-gray-500 whitespace-nowrap">{p.kode_tiket}</span>
                </div>
              ))}
            </div>
            
            <hr className="my-2 md:my-3 border-gray-200" />
            
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm md:text-base text-gray-900">Total Bayar</span>
              <span className="font-bold text-blue-600 text-base md:text-lg">Rp {totalHarga.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {step === 'pilih' && (
            <div className="bg-white p-4 md:p-5 rounded-lg shadow-sm border border-gray-200">
              <h2 className="font-bold text-gray-900 mb-3 text-sm md:text-base">Pilih Metode Pembayaran</h2>
              <button
                onClick={() => setStep('qris')}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium text-left px-4 transition-colors shadow-sm"
              >
                <span className="block text-sm md:text-base">💳 Transfer / QRIS (Online)</span>
                <span className="block text-[10px] md:text-xs font-normal mt-0.5 opacity-90">
                  Bayar dari rumah lewat HP. E-tiket langsung terbit.
                </span>
              </button>
            </div>
          )}

          {step === 'qris' && (
            <div className="bg-white p-4 md:p-5 rounded-lg shadow-sm text-center text-gray-900 border border-gray-200">
              <p className="text-xs md:text-sm text-gray-600 mb-2 md:mb-3">Scan QR ini untuk membayar (mode simulasi)</p>
              
              <div className="bg-gray-50 w-32 h-32 md:w-48 md:h-48 mx-auto flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
                <span className="text-gray-400 text-xs md:text-sm font-medium text-center">QR Code<br />(simulasi)</span>
              </div>
              
              <p className="text-[10px] md:text-xs text-red-600 font-bold mt-2 md:mt-3 bg-red-50 inline-block px-3 py-1 rounded-full">
                ⏳ Batas waktu: 10 menit
              </p>
            </div>
          )}

          {error && <p className="text-red-600 text-xs md:text-sm font-bold text-center bg-red-50 py-2 rounded-lg">{error}</p>}
          
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3 md:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div className="max-w-md mx-auto space-y-2">
          
          {step === 'qris' && (
            <>
              <button
                onClick={handleBayarOnline}
                disabled={sedangBayar}
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-bold text-sm md:text-base shadow-md transition-colors"
              >
                {sedangBayar ? 'Memproses...' : `✓ Saya Sudah Bayar (${jumlahDewasa} tiket)`}
              </button>

              <button
                onClick={() => { setStep('pilih'); setError('') }}
                disabled={sedangBayar}
                className="w-full text-gray-600 py-2 text-xs md:text-sm hover:underline font-medium"
              >
                ← Ganti metode pembayaran
              </button>
            </>
          )}

          <button
            onClick={handleBatal}
            className="w-full text-red-600 py-2 text-xs md:text-sm font-bold hover:underline"
          >
            ✕ Batalkan Pesanan
          </button>

        </div>
      </div>

    </div>
  )
}

export default function PembayaranPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-900 mt-10">Memuat halaman...</p>}>
      <PembayaranContent />
    </Suspense>
  )
}