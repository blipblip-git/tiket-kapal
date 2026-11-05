'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'

type PesananItem = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  jadwal_id: string
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
}

function CashContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')

  const [pesananList, setPesananList] = useState<PesananItem[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: p, error: errP } = await supabase
        .from('pesanan')
        .select('id, nama_penumpang, kode_tiket, jadwal_id')
        .in('id', pesananIds)

      if (errP || !p || p.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      const sorted = pesananIds
        .map((id) => p.find((x) => x.id === id))
        .filter((x): x is PesananItem => !!x)

      setPesananList(sorted)

      if (sorted[0]) {
        const { data: j } = await supabase
          .from('jadwal')
          .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga')
          .eq('id', sorted[0].jadwal_id)
          .single()

        if (j) setDetail(j)
      }

      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleKembali() {
    const sesi = getOperatorSession()
    if (sesi) {
      router.push('/dashboard/loket')
    } else {
      router.push('/')
    }
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (pesananList.length === 0 || !detail) return <p className="p-6 text-gray-900">Data tidak lengkap</p>

  const totalHarga = detail.harga * pesananList.length

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">💵 Bayar di Loket</h1>
          <p className="text-sm text-gray-700 mt-1">Tunjukkan halaman ini ke petugas loket</p>
        </div>

        <div className="bg-white p-4 rounded shadow mb-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Kode Pesanan</p>
          <p className="font-bold text-xl text-gray-900">{pesananList[0]?.kode_tiket || '-'}</p>
          {pesananList.length > 1 && (
            <p className="text-xs text-gray-600 mt-1">(+{pesananList.length - 1} tiket lainnya)</p>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-300 p-4 rounded mb-4 text-sm text-yellow-900">
          <p className="font-bold mb-2">⏱ Penting:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Kursi akan di-<b>hold 10 menit</b> dari sekarang</li>
            <li>Kalau lewat 10 menit & belum bayar → kursi dilepas otomatis</li>
            <li>Bayar tunai ke petugas loket</li>
            <li>Petugas konfirmasi → e-tiket langsung terbit</li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded shadow mb-4 text-gray-900">
          <h2 className="font-bold mb-3 text-gray-900">Detail Pesanan</h2>
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
              <span className="font-medium text-gray-900">{pesananList.length} orang</span>
            </div>
          </div>

          <hr className="my-3" />

          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900">Total Bayar</span>
            <span className="font-bold text-blue-600 text-lg">
              Rp {totalHarga.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 text-sm text-gray-900">
          <p className="font-bold mb-2">Penumpang:</p>
          <ol className="list-decimal list-inside space-y-1">
            {pesananList.map((p) => (
              <li key={p.id}>{p.nama_penumpang}</li>
            ))}
          </ol>
        </div>

        <button
          onClick={handleKembali}
          className="w-full bg-gray-600 text-white py-3 rounded hover:bg-gray-700 font-medium"
        >
          ← Kembali
        </button>
      </div>
    </div>
  )
}

export default function CashPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900">Memuat...</p>}>
      <CashContent />
    </Suspense>
  )
}