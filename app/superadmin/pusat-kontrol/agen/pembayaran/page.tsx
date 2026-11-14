'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { cetakTiketThermal } from '@/lib/thermalPrinter'

type Pesanan = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  is_balita: boolean
  kursi_id: string | null
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
}

function PembayaranSuperadminContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [pesananList, setPesananList] = useState<Pesanan[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metode, setMetode] = useState<'cash' | 'qris'>('cash')
  const [proses, setProses] = useState(false)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    if (pesananIds.length === 0) {
      router.push('/superadmin/pusat-kontrol/agen/jual-tiket')
      return
    }

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

      const { data: pData } = await supabase
        .from('pesanan')
        .select('id, nama_penumpang, kode_tiket, is_balita, kursi_id')
        .in('id', pesananIds)

      if (!pData || pData.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      setPesananList(pData)

      const { data: jData } = await supabase
        .from('jadwal')
        .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal:kapal_id(nama)')
        .eq('id', (pData[0] as any).jadwal_id)
        .single()

      if (jData) {
        setDetail({
          rute_asal: jData.rute_asal,
          rute_tujuan: jData.rute_tujuan,
          tanggal: jData.tanggal,
          jam_berangkat: jData.jam_berangkat,
          harga: jData.harga,
          nama_kapal: (jData.kapal as any)?.nama || '-',
        })
      }

      setLoading(false)
    }
    init()
  }, [pesananParam, router])

  async function handleBayar() {
    if (!profile || !detail) return
    setProses(true)
    setError('')

    try {
      const totalBayar = pesananList.filter(p => !p.is_balita).length * detail.harga

      // 1. Update status pesanan jadi 'paid'
      const { error: errPesanan } = await supabase
        .from('pesanan')
        .update({ 
          status: 'paid', 
          waktu_bayar: new Date().toISOString(),
          petugas_jual: profile.email,
        })
        .in('id', pesananIds)

      if (errPesanan) throw errPesanan

      // 2. Insert ke tabel pembayaran
      const { error: errBayar } = await supabase
        .from('pembayaran')
        .insert({
          pesanan_id: pesananIds[0],
          metode,
          jumlah: totalBayar,
          status: 'success',
          waktu_bayar: new Date().toISOString(),
        })

      if (errBayar) throw errBayar

      // 3. Update status kursi jadi 'terisi'
      for (const p of pesananList) {
        if (p.kursi_id) {
          await supabase.from('kursi').update({ status: 'terisi' }).eq('id', p.kursi_id)
        }
      }

      // 4. Arahkan ke halaman cetak/etiket
      router.push(`/etiket?pesanan=${pesananIds.join(',')}`)

    } catch (err: any) {
      setError('Gagal memproses pembayaran: ' + err.message)
      setProses(false)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  const totalHarga = pesananList.filter(p => !p.is_balita).length * (detail?.harga || 0)

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 flex flex-col items-center">
      <div className="max-w-md w-full bg-white p-6 rounded-xl shadow-md space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Pembayaran</h2>
          <p className="text-sm text-gray-600">{detail?.rute_asal} &rarr; {detail?.rute_tujuan}</p>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Tanggal</span>
            <span className="font-bold">{detail?.tanggal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Jam</span>
            <span className="font-bold">{detail?.jam_berangkat?.substring(0,5)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Kapal</span>
            <span className="font-bold">{detail?.nama_kapal}</span>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-gray-900 mb-2">Rincian Penumpang</h3>
          <div className="space-y-2">
            {pesananList.map((p, idx) => (
              <div key={p.id} className="flex justify-between text-sm border-b pb-2">
                <div>
                  <p className="font-medium">{p.nama_penumpang} {p.is_balita && <span className="text-orange-600">(Balita)</span>}</p>
                  <p className="text-xs text-gray-500">{p.kode_tiket}</p>
                </div>
                <span className="font-bold">
                  {p.is_balita ? 'Gratis' : `Rp ${detail?.harga.toLocaleString('id-ID')}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <span className="font-bold text-gray-900">Total Bayar</span>
          <span className="font-bold text-xl text-blue-600">Rp {totalHarga.toLocaleString('id-ID')}</span>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</label>
          <div className="flex gap-3">
            <button
              onClick={() => setMetode('cash')}
              className={`flex-1 py-2 rounded-lg border font-bold text-sm ${metode === 'cash' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              Cash
            </button>
            <button
              onClick={() => setMetode('qris')}
              className={`flex-1 py-2 rounded-lg border font-bold text-sm ${metode === 'qris' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              QRIS
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleBayar}
          disabled={proses}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50"
        >
          {proses ? 'Memproses...' : 'Konfirmasi Pembayaran'}
        </button>
      </div>
    </div>
  )
}

export default function PembayaranSuperadminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <PembayaranSuperadminContent />
    </Suspense>
  )
}