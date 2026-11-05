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
  kursi_id: string
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
          .select('id, nama_penumpang, kode_tiket, status, jadwal_id, kursi_id')
          .in('id', pesananIds)

        if (errP) throw errP
        if (!p || p.length === 0) {
          setError('Data pesanan tidak ditemukan di database.')
          setLoading(false)
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
  }, [])

  async function handleBatal() {
    if (pesananList.length === 0) return
    const ids = pesananList.map(p => p.id)
    const kursiIds = pesananList.map(p => p.kursi_id).filter(Boolean)

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
    if (pesananList.length === 0 || !detail) return
    setSedangBayar(true)
    setError('')

    const waktuBayar = new Date().toISOString()
    const ids = pesananList.map((p) => p.id)

    try {
      console.log('1. Mulai update pesanan', ids)
      // 1. Update status pesanan
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

      console.log('3. Mulai update kursi')
      // 2. Update status kursi
      const kursiIds = pesananList.map((p) => p.kursi_id)
      const { error: errK } = await supabase
        .from('kursi')
        .update({ status: 'terisi' })
        .in('id', kursiIds)

      if (errK) throw new Error('Gagal update kursi: ' + errK.message)
      console.log('4. Selesai update kursi')

      console.log('5. Mulai insert pembayaran')
      // 3. Simpan data pembayaran
      const pembayaranData = pesananList.map((p) => ({
        pesanan_id: p.id,
        metode: 'simulasi_online',
        jumlah: detail.harga,
        status: 'sukses',
        waktu_bayar: waktuBayar,
      }))
      
      const { error: errPay } = await supabase.from('pembayaran').insert(pembayaranData)
      if (errPay) throw new Error('Gagal simpan pembayaran: ' + errPay.message)
      console.log('6. Selesai insert pembayaran')

      console.log('7. Pindah ke etiket')
      // 4. Pindah ke E-Tiket jika semua sukses
      router.push(`/etiket?pesanan=${ids.join(',')}`)
    } catch (err: any) {
      console.error('Error di handleBayarOnline:', err)
      setError(err.message || 'Terjadi kesalahan saat memproses pembayaran.')
      setSedangBayar(false)
    }
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat data pembayaran...</p>
  if (error && !detail) return <p className="p-6 text-red-600 font-bold">Error: {error}</p>
  if (pesananList.length === 0 || !detail) return <p className="p-6 text-gray-900">Data pesanan tidak lengkap.</p>

  const totalHarga = detail.harga * pesananList.length

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Pembayaran</h1>

        <div className="bg-white p-6 rounded shadow mb-4 text-gray-900">
          <h2 className="font-bold mb-3 text-gray-900">Detail Pesanan</h2>
          <div className="text-sm space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-900">Rute</span>
              <span className="font-medium text-gray-900">{detail.rute_asal} → {detail.rute_tujuan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-900">Tanggal</span>
              <span className="font-medium text-gray-900">{detail.tanggal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-900">Jam</span>
              <span className="font-medium text-gray-900">{detail.jam_berangkat}</span>
            </div>
          </div>
          <hr className="my-3" />
          <p className="font-bold text-gray-900 mb-2 text-sm">Daftar Penumpang ({pesananList.length} orang)</p>
          <div className="space-y-1 mb-4">
            {pesananList.map((p, idx) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-gray-900">{idx + 1}. {p.nama_penumpang}</span>
                <span className="text-xs text-gray-600">{p.kode_tiket}</span>
              </div>
            ))}
          </div>
          <hr className="my-3" />
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900">Total Bayar</span>
            <span className="font-bold text-blue-600 text-lg">Rp {totalHarga.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {step === 'pilih' && (
          <div className="bg-white p-6 rounded shadow mb-4">
            <h2 className="font-bold text-gray-900 mb-3 text-sm">Pilih Metode Pembayaran</h2>
            <button
              onClick={() => setStep('qris')}
              className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 font-medium text-left px-4"
            >
              💳 Transfer / QRIS (Online)
              <span className="block text-xs font-normal mt-1 opacity-90">
                Bayar dari rumah lewat HP. E-tiket langsung terbit.
              </span>
            </button>
          </div>
        )}

        {step === 'qris' && (
          <>
            <div className="bg-white p-6 rounded shadow mb-4 text-center text-gray-900">
              <p className="text-sm text-gray-900 mb-3">Scan QR ini untuk membayar (mode simulasi)</p>
              <div className="bg-gray-100 w-48 h-48 mx-auto flex items-center justify-center rounded border-2 border-dashed border-gray-400">
                <span className="text-gray-900 text-sm">QR Code<br />(simulasi)</span>
              </div>
              <p className="text-xs text-gray-900 mt-3">Batas waktu: 10 menit</p>
            </div>

            {error && <p className="text-red-600 text-sm mb-3 font-bold">{error}</p>}

            <button
              onClick={handleBayarOnline}
              disabled={sedangBayar}
              className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {sedangBayar ? 'Memproses...' : `✓ Saya Sudah Bayar (${pesananList.length} tiket)`}
            </button>

            <button
              onClick={() => { setStep('pilih'); setError('') }}
              disabled={sedangBayar}
              className="w-full text-gray-700 py-2 mt-2 text-sm hover:underline"
            >
              ← Ganti metode pembayaran
            </button>
          </>
        )}

        <button
          onClick={handleBatal}
          className="w-full text-red-600 py-3 mt-4 text-sm font-bold hover:underline"
        >
          ✕ Batalkan Pesanan
        </button>

      </div>
    </div>
  )
}

export default function PembayaranPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900">Memuat halaman...</p>}>
      <PembayaranContent />
    </Suspense>
  )
}