'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type PesananItem = {
  id: string
  nama_penumpang: string
  kode_tiket: string
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

function PembayaranSuperadminContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')
  
  // --- INI YANG DIPERBAIKI: Prioritas ambil dari 'dari', fallback ke 'kanal' ---
  const dariParam = searchParams.get('dari')
  const kanalParam = searchParams.get('kanal')
  const kanal = dariParam || kanalParam || 'agen'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [pesananList, setPesananList] = useState<PesananItem[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [proses, setProses] = useState(false)
  const [error, setError] = useState('')
  const [metode, setMetode] = useState<'cash' | 'qris'>('cash')
  const [sisaWaktu, setSisaWaktu] = useState(300)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) {
        router.push('/superadmin')
        return
      }
      setProfile(p)

      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: pData, error: errP } = await supabase
        .from('pesanan')
        .select('id, nama_penumpang, kode_tiket, jadwal_id, kursi_id, is_balita')
        .in('id', pesananIds)

      if (errP || !pData || pData.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      const sorted = pesananIds
        .map((id) => pData.find((x) => x.id === id))
        .filter((x): x is PesananItem => !!x)

      setPesananList(sorted)

      if (sorted[0]) {
        const { data: jData } = await supabase
          .from('jadwal')
          .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga')
          .eq('id', sorted[0].jadwal_id)
          .maybeSingle()

        if (jData) setDetail(jData)
      }

      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (loading || error || proses) return
    if (sisaWaktu <= 0) return

    const timer = setInterval(() => {
      setSisaWaktu((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [loading, error, proses, sisaWaktu])

  const handleKonfirmasi = async () => {
    if (!profile || !detail) return
    
    if (sisaWaktu <= 0) {
      alert('Waktu pembayaran sudah habis. Silakan ulangi transaksi.')
      return
    }

    setProses(true)
    setError('')

    try {
      const waktuSekarang = new Date().toISOString()

      const { error: errUpdate } = await supabase
        .from('pesanan')
        .update({
          status: 'paid',
          waktu_bayar: waktuSekarang,
          petugas_konfirmasi: profile.email,
          waktu_konfirmasi: waktuSekarang,
        })
        .in('id', pesananIds)

      if (errUpdate) throw errUpdate

      const kursiIds = pesananList
        .filter((p) => !p.is_balita && p.kursi_id)
        .map((p) => p.kursi_id)
      
      if (kursiIds.length > 0) {
        const { error: errKursi } = await supabase
          .from('kursi')
          .update({ status: 'terisi' })
          .in('id', kursiIds)
        if (errKursi) throw errKursi
      }

      // Balita gratis: hanya penumpang dewasa yang dicatat pembayarannya
      const pembayaranPayload = pesananList
        .filter((p) => !p.is_balita)
        .map((p) => ({
          pesanan_id: p.id,
          metode: metode,
          jumlah: detail.harga,
          status: 'sukses',
          waktu_bayar: waktuSekarang,
        }))

      await supabase.from('pembayaran').insert(pembayaranPayload)

      // Bawa parameter 'dari' ke halaman etiket
      router.push(`/etiket?pesanan=${pesananParam}&dari=${kanal}`)

    } catch (err: any) {
      console.error('Error konfirmasi:', err)
      setError('Gagal konfirmasi pembayaran: ' + err.message)
      setProses(false)
    }
  }

  function handleKembali() {
    if (kanal === 'petugas') {
      router.push('/superadmin/pusat-kontrol/petugas/loket-jual')
    } else {
      router.push('/superadmin/pusat-kontrol/agen/loket-jual')
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>
  if (!profile || pesananList.length === 0 || !detail) return null

  const totalHarga = detail.harga * pesananList.filter((p) => !p.is_balita).length
  const menit = Math.floor(sisaWaktu / 60)
  const detik = sisaWaktu % 60

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-4">
        
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Konfirmasi Pembayaran</h1>
          <p className="text-sm text-gray-600 mt-1">
            Mode {kanal === 'petugas' ? 'Petugas' : 'Agen'} (Superadmin)
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-300 p-3 rounded-lg text-center">
          <p className="text-xs text-yellow-800 font-bold mb-1">Sisa Waktu Pembayaran</p>
          <p className={`text-2xl font-bold ${sisaWaktu <= 60 ? 'text-red-600' : 'text-yellow-700'}`}>
            {String(menit).padStart(2, '0')}:{String(detik).padStart(2, '0')}
          </p>
          <p className="text-[10px] text-yellow-700 mt-1">Kursi akan dilepas otomatis jika waktu habis</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h2 className="font-bold text-gray-900 mb-3">Detail Pesanan</h2>
          <div className="text-sm space-y-2">
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
            <div className="flex justify-between">
              <span className="text-gray-600">Jumlah Tiket</span>
              <span className="font-medium text-gray-900">{pesananList.filter((p) => !p.is_balita).length} Dewasa</span>
            </div>
            {pesananList.some((p) => p.is_balita) && (
              <div className="flex justify-between">
                <span className="text-gray-600">Balita</span>
                <span className="font-medium text-orange-600">{pesananList.filter((p) => p.is_balita).length} org</span>
              </div>
            )}
          </div>

          <hr className="my-3" />

          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900">Total Bayar</span>
            <span className="font-bold text-blue-600 text-lg">
              Rp {totalHarga.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-sm text-gray-900">
          <p className="font-bold mb-2">Penumpang:</p>
          <ol className="list-decimal list-inside space-y-1">
            {pesananList.map((p) => (
              <li key={p.id}>
                {p.nama_penumpang}
                {p.is_balita && <span className="text-orange-600 text-xs ml-1">(Balita)</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h2 className="font-bold text-gray-900 mb-2">Metode Pembayaran</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setMetode('cash')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                metode === 'cash'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              💵 Cash
            </button>
            <button
              onClick={() => setMetode('qris')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                metode === 'qris'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📱 QRIS
            </button>
          </div>
          {metode === 'qris' && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <p className="text-xs text-yellow-800 font-bold">Simulasi QRIS</p>
              <p className="text-[10px] text-yellow-700 mt-1">
                * Di produksi, ini akan muncul QR Code asli. Untuk sekarang, klik tombol Konfirmasi untuk simulasi sukses.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <div className="space-y-2">
          <button
            onClick={handleKonfirmasi}
            disabled={proses || sisaWaktu <= 0}
            className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
              proses || sisaWaktu <= 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {proses ? 'Memproses...' : `✅ Konfirmasi Pembayaran (${metode === 'cash' ? 'Cash' : 'QRIS'})`}
          </button>

          <button
            onClick={handleKembali}
            className="w-full bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            &larr; Batal & Kembali
          </button>
        </div>

      </div>
    </div>
  )
}

export default function PembayaranSuperadminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <PembayaranSuperadminContent />
    </Suspense>
  )
}