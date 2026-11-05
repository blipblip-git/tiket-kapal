'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Kursi = {
  id: string
  nomor_kursi: string
  status: string
}

function KursiContent() {
  const searchParams = useSearchParams()
  const jadwalId = searchParams.get('jadwal')

  const [kursi, setKursi] = useState<Kursi[]>([])
  const [layout, setLayout] = useState<string>('tanpa_layout')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dipilih, setDipilih] = useState<string[]>([])

  useEffect(() => {
    async function fetchKursi() {
      if (!jadwalId) {
        setError('Jadwal tidak ditemukan di URL')
        setLoading(false)
        return
      }

      // Ambil data kursi
      const { data, error: errK } = await supabase
        .from('kursi')
        .select('*')
        .eq('jadwal_id', jadwalId)

      if (errK) {
        setError(errK.message)
        setLoading(false)
        return
      }

      // URUTKAN SECARA NUMERIK DI FRONTEND
      const sortedKursi = (data || []).sort((a, b) => {
        const numA = parseInt(a.nomor_kursi, 10)
        const numB = parseInt(b.nomor_kursi, 10)
        return numA - numB
      })

      setKursi(sortedKursi)

      const { data: j } = await supabase
        .from('jadwal')
        .select('kapal_id')
        .eq('id', jadwalId)
        .single()

      if (j?.kapal_id) {
        const { data: kap } = await supabase
          .from('kapal')
          .select('layout_kursi')
          .eq('id', j.kapal_id)
          .single()

        if (kap?.layout_kursi) setLayout(kap.layout_kursi)
      }

      setLoading(false)
    }

    fetchKursi()
  }, [jadwalId])

  function toggleKursi(id: string) {
    if (dipilih.includes(id)) {
      setDipilih(dipilih.filter((k) => k !== id))
    } else {
      if (dipilih.length >= 30) {
        alert('Maksimal 30 kursi per pembelian')
        return
      }
      setDipilih([...dipilih, id])
    }
  }

  function renderKursiButton(k: Kursi) {
    const terisi = k.status !== 'kosong'
    const terpilih = dipilih.includes(k.id)

    return (
      <button
        key={k.id}
        disabled={terisi}
        onClick={() => toggleKursi(k.id)}
        className={
          'py-3 rounded font-medium text-sm ' +
          (terisi
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : terpilih
            ? 'bg-blue-600 text-white'
            : 'bg-green-100 text-green-800 hover:bg-green-200')
        }
      >
        {k.nomor_kursi}
      </button>
    )
  }

  function renderLayout23() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 5) {
      baris.push(kursi.slice(i, i + 5))
    }

    return (
      <div className="space-y-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-center gap-2">
            <div className="grid grid-cols-2 gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-8" />
            <div className="grid grid-cols-3 gap-2 flex-1 max-w-[55%]">
              {row.slice(2, 5).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayout22() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 4) {
      baris.push(kursi.slice(i, i + 4))
    }

    return (
      <div className="space-y-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-center gap-2">
            <div className="grid grid-cols-2 gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-8" />
            <div className="grid grid-cols-2 gap-2 flex-1 max-w-[40%]">
              {row.slice(2, 4).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayoutTanpa() {
    return (
      <div className="grid grid-cols-6 gap-2">
        {kursi.map((k) => renderKursiButton(k))}
      </div>
    )
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat kursi...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-gray-900">Pilih Kursi</h1>
        <p className="text-sm text-gray-700 mb-2">
          Klik kursi yang kosong. Bisa pilih banyak kursi (maks 30).
        </p>
        <p className="text-sm text-gray-700 mb-6">
          Layout: {layout} • Dipilih: <b>{dipilih.length}</b> kursi
        </p>

        <div className="bg-white p-4 rounded shadow mb-6">
          {layout === '2-3' && renderLayout23()}
          {layout === '2-2' && renderLayout22()}
          {layout !== '2-3' && layout !== '2-2' && renderLayoutTanpa()}
        </div>

        {dipilih.length > 0 && (
          <div className="bg-white p-4 rounded shadow border-l-4 border-blue-600">
            <p className="mb-2 text-sm text-gray-900">
              Kursi dipilih:{' '}
              <span className="font-bold">
                {dipilih
                  .map((id) => kursi.find((k) => k.id === id)?.nomor_kursi)
                  .join(', ')}
              </span>
            </p>
            <p className="mb-3 text-sm text-gray-700">
              Total {dipilih.length} kursi
            </p>
            <a
              href={`/form?jadwal=${jadwalId}&kursi=${dipilih.join(',')}`}
              className="block text-center bg-blue-600 text-white py-2 rounded hover:bg-blue-700 font-medium"
            >
              Lanjut Isi Data Penumpang →
            </a>
          </div>
        )}

        <div className="mt-6">
          <Link href="/" className="text-blue-600 text-sm hover:underline">
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function KursiPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900">Memuat...</p>}>
      <KursiContent />
    </Suspense>
  )
}