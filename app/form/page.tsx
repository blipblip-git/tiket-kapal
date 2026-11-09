'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Kursi = {
  id: string
  nomor_kursi: string
  status: string
}

type Penumpang = {
  nama: string
}

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

function FormContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const jadwalId = searchParams.get('jadwal')
  const kursiIdStr = searchParams.get('kursi')

  const [jadwal, setJadwal] = useState<any>(null)
  const [kursiList, setKursiList] = useState<Kursi[]>([])
  const [loading, setLoading] = useState(true)
  const [proses, setProses] = useState(false)
  const [error, setError] = useState('')

  const [penumpangList, setPenumpangList] = useState<Penumpang[]>([])
  const [noHp, setNoHp] = useState('')

  // State Balita
  const [bawaBalita, setBawaBalita] = useState(false)
  const [namaBalita, setNamaBalita] = useState('')

  const kursiIds = kursiIdStr ? kursiIdStr.split(',') : []

  useEffect(() => {
    if (!jadwalId || kursiIds.length === 0) {
      router.push('/')
      return
    }

    const fetchData = async () => {
      const { data: jData } = await supabase
        .from('jadwal')
        .select(`*, kapal:kapal_id (nama)`)
        .eq('id', jadwalId)
        .single()
      
      const { data: kData } = await supabase
        .from('kursi')
        .select('*')
        .in('id', kursiIds)

      if (jData && kData) {
        setJadwal(jData)
        setPenumpangList(kursiIds.map(() => ({ nama: '' })))
        setKursiList(kData)
      }
      setLoading(false)
    }

    fetchData()
  }, [jadwalId, kursiIdStr, router])

  const updatePenumpang = (idx: number, field: keyof Penumpang, value: string) => {
    const baru = [...penumpangList]
    baru[idx] = { ...baru[idx], [field]: value }
    setPenumpangList(baru)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jadwal || kursiList.length === 0) return
    
    for (let i = 0; i < penumpangList.length; i++) {
      if (!penumpangList[i].nama) {
        setError(`Nama penumpang #${i + 1} wajib diisi.`)
        return
      }
    }

    if (bawaBalita && !namaBalita) {
      setError('Nama balita wajib diisi.')
      return
    }
    
    setProses(true)
    setError('')

    try {
      const grupTransaksiId = crypto.randomUUID()
      const waktuSekarang = new Date().toISOString()
      const waktuExpired = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      // Data Penumpang Dewasa
      const pesananPayload = penumpangList.map((p, idx) => {
        const namaRapi = toTitleCase(p.nama)

        return {
          jadwal_id: jadwalId,
          kursi_id: kursiList[idx].id,
          nama_penumpang: namaRapi,
          nik: '-',
          nomor_hp: noHp,
          kanal: 'online',
          status: 'pending',
          kode_tiket: 'TKT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          grup_transaksi_id: grupTransaksiId,
          waktu_pesan: waktuSekarang,
          waktu_expired: waktuExpired,
          is_balita: false,
        }
      })

      // Data Balita
      if (bawaBalita && namaBalita) {
        pesananPayload.push({
          jadwal_id: jadwalId,
          kursi_id: null as any, // Tanpa kursi
          nama_penumpang: toTitleCase(namaBalita),
          nik: '-',
          nomor_hp: noHp,
          kanal: 'online',
          status: 'pending',
          kode_tiket: 'BALITA-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          grup_transaksi_id: grupTransaksiId,
          waktu_pesan: waktuSekarang,
          waktu_expired: waktuExpired,
          is_balita: true,
        })
      }

      const { data: insertedPesanan, error: errPesanan } = await supabase
        .from('pesanan')
        .insert(pesananPayload)
        .select()

      if (errPesanan) throw errPesanan

      if (insertedPesanan && insertedPesanan.length > 0) {
        const idList = insertedPesanan.map(p => p.id).join(',')
        router.push(`/pembayaran?pesanan=${idList}`)
      }

    } catch (err: any) {
      console.error(err)
      setError('Gagal memproses pesanan: ' + err.message)
      setProses(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-900">Memuat data...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-md">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Data Penumpang</h2>
          <p className="mt-1 text-sm text-gray-600">
            {jadwal?.rute_asal} &rarr; {jadwal?.rute_tujuan} | Total {kursiList.length} tiket
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {penumpangList.map((p, idx) => (
            <div key={idx} className="border-t pt-4 first:border-0 first:pt-0">
              <div className="flex justify-between items-center mb-2">
                <p className="font-bold text-gray-900">
                  Penumpang #{idx + 1}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                    value={p.nama}
                    onChange={(e) => updatePenumpang(idx, 'nama', e.target.value)}
                    placeholder="Sesuai KTP"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* OPSI BALITA */}
          <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="bawaBalita"
                checked={bawaBalita} 
                onChange={(e) => setBawaBalita(e.target.checked)} 
                className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
              />
              <label htmlFor="bawaBalita" className="text-sm font-bold text-orange-900 cursor-pointer">
                Bawa Balita di bawah 4 tahun? (Gratis)
              </label>
            </div>
            {bawaBalita && (
              <div>
                <label className="block mb-1 text-xs font-medium text-orange-900">Nama Balita</label>
                <input 
                  type="text" 
                  value={namaBalita} 
                  onChange={(e) => setNamaBalita(e.target.value)} 
                  className="w-full border border-orange-300 rounded px-3 py-1.5 text-sm text-gray-900" 
                  placeholder="Nama anak" 
                />
                <p className="text-xs text-orange-700 mt-1 italic">*Balita tidak memerlukan kursi dan tidak dikenakan biaya.</p>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700">Nomor HP (Aktif)</label>
            <input
              type="tel"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              value={noHp}
              onChange={(e) => setNoHp(e.target.value.replace(/\D/g, ''))}
              placeholder="Contoh: 081234567890"
            />
            <p className="text-xs text-gray-500 mt-1">Kode tiket akan dikirim ke nomor ini.</p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={proses}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none disabled:opacity-50"
          >
            {proses ? 'Memproses...' : 'Lanjut ke Pembayaran'}
          </button>
        </form>

        <div className="text-center">
          <a href={`/kursi?jadwal=${jadwalId}`} className="text-sm text-gray-500 hover:text-gray-800">
            &larr; Kembali pilih kursi
          </a>
        </div>
      </div>
    </div>
  )
}

export default function FormPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-900">Memuat form...</div>}>
      <FormContent />
    </Suspense>
  )
}