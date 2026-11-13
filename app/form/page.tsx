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
  nik: string
  is_balita: boolean
  nama_balita: string
}

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const maskNik = (nik: string) => {
  if (!nik || nik.length !== 16) return nik;
  return nik.slice(0, 4) + '********' + nik.slice(12);
}

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

  const kursiIds = kursiIdStr ? kursiIdStr.split(',') : []

  useEffect(() => {
    if (!jadwalId || kursiIds.length === 0) {
      router.push('/')
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError('')
      
      try {
        const { data: jData, error: errJ } = await supabase
          .from('jadwal')
          .select(`*, kapal:kapal_id (nama)`)
          .eq('id', jadwalId)
          .single()
        
        const { data: kData, error: errK } = await supabase
          .from('kursi')
          .select('*')
          .in('id', kursiIds)

        if (errJ || errK) {
          throw new Error('Gagal mengambil data jadwal atau kursi.')
        }

        // === VALIDASI: KURSI HARUS ADA ===
        if (!jData) {
          throw new Error('Jadwal tidak ditemukan.')
        }

        if (!kData || kData.length === 0) {
          throw new Error('Kursi yang dipilih tidak ditemukan. Silakan pilih kursi lagi.')
        }

        if (kData.length !== kursiIds.length) {
          throw new Error('Beberapa kursi yang dipilih tidak valid. Silakan ulangi.')
        }

        setJadwal(jData)
        setPenumpangList(kData.map(() => ({ nama: '', nik: '', is_balita: false, nama_balita: '' })))
        setKursiList(kData)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [jadwalId, kursiIdStr, router])

  const updatePenumpang = (idx: number, field: keyof Penumpang, value: any) => {
    const baru = [...penumpangList]
    baru[idx] = { ...baru[idx], [field]: value }
    setPenumpangList(baru)
  }

  const toggleBalita = (idx: number) => {
    const baru = [...penumpangList]
    const currentStatus = baru[idx].is_balita
    baru[idx] = {
      ...baru[idx],
      is_balita: !currentStatus,
      nama_balita: !currentStatus ? baru[idx].nama_balita : ''
    }
    setPenumpangList(baru)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!jadwal || kursiList.length === 0) {
      setError('Data jadwal atau kursi belum siap. Silakan refresh halaman.')
      return
    }
    
    for (let i = 0; i < penumpangList.length; i++) {
      if (!penumpangList[i].nama) {
        setError(`Nama penumpang #${i + 1} wajib diisi.`)
        return
      }
      if (penumpangList[i].nik.length !== 16) {
        setError(`NIK penumpang #${i + 1} harus 16 digit. (Saat ini: ${penumpangList[i].nik.length} digit)`)
        return
      }
      if (penumpangList[i].is_balita && !penumpangList[i].nama_balita) {
        setError(`Nama balita untuk penumpang #${i + 1} wajib diisi.`)
        return
      }
    }
    
    setProses(true)
    setError('')

    try {
      const grupTransaksiId = crypto.randomUUID()
      const waktuSekarang = new Date().toISOString()
      const waktuExpired = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      const pesananPayload: any[] = []

      penumpangList.forEach((p, idx) => {
        // === PASTIKAN KURSI_ID ADA ===
        const kursiId = kursiList[idx]?.id
        if (!kursiId) {
          throw new Error(`Kursi untuk penumpang #${idx + 1} tidak ditemukan.`)
        }

        pesananPayload.push({
          jadwal_id: jadwalId,
          kursi_id: kursiId,
          nama_penumpang: toTitleCase(p.nama),
          nik: maskNik(p.nik),
          nomor_hp: noHp,
          kanal: 'online',
          status: 'pending',
          kode_tiket: 'TKT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          grup_transaksi_id: grupTransaksiId,
          waktu_pesan: waktuSekarang,
          waktu_expired: waktuExpired,
          is_balita: false,
        })

        if (p.is_balita && p.nama_balita) {
          pesananPayload.push({
            jadwal_id: jadwalId,
            kursi_id: null,
            nama_penumpang: toTitleCase(p.nama_balita),
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
      })

      const { data: insertedPesanan, error: errPesanan } = await supabase
        .from('pesanan')
        .insert(pesananPayload)
        .select()

      if (errPesanan) throw errPesanan

      if (insertedPesanan && insertedPesanan.length > 0) {
        const idList = insertedPesanan.map(p => p.id).join(',')
        router.push(`/pembayaran?pesanan=${idList}`)
      } else {
        throw new Error('Gagal insert pesanan (data kosong)')
      }

    } catch (err: any) {
      console.error('Error saat insert:', err)
      setError('Gagal memproses pesanan: ' + err.message)
      setProses(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-900">Memuat data...</div>
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-xl shadow-md text-center max-w-sm w-full">
          <p className="text-red-600 font-bold mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
            Kembali ke Beranda
          </button>
        </div>
      </div>
    )
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
                  {kursiList[idx] && <span className="text-sm font-normal text-gray-500 ml-2">(Kursi {kursiList[idx].nomor_kursi})</span>}
                </p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      value={p.nama}
                      onChange={(e) => updatePenumpang(idx, 'nama', e.target.value)}
                      placeholder="Sesuai KTP"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Status</label>
                    <button
                      type="button"
                      onClick={() => toggleBalita(idx)}
                      className={`mt-1 flex items-start gap-2 w-full text-left p-1.5 rounded transition-colors ${p.is_balita ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${p.is_balita ? 'bg-orange-600 border-orange-600' : 'bg-white border-gray-300'}`}>
                        {p.is_balita && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-orange-900 leading-tight">Apakah ada balita ?</span>
                        <span className="text-[10px] text-orange-800 leading-tight">(Free dibawah 4 th dipangku)</span>
                      </div>
                    </button>
                  </div>
                </div>

                {p.is_balita && (
                  <div className="bg-orange-50 p-3 rounded-md border border-orange-200 mt-2">
                    <input
                      type="text"
                      className="block w-full px-3 py-2 border border-orange-300 rounded-md shadow-sm text-gray-900 focus:ring-orange-500 focus:border-orange-500 text-sm"
                      value={p.nama_balita}
                      onChange={(e) => updatePenumpang(idx, 'nama_balita', e.target.value)}
                      placeholder="Nama Balita"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700">NIK (16 digit)</label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    value={p.nik}
                    onChange={(e) => updatePenumpang(idx, 'nik', e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder="16 digit angka"
                  />
                </div>
              </div>
            </div>
          ))}

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