'use client'

import { useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Tiket = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  status: string
  waktu_pesan: string
  grup_transaksi_id: string
  jadwal_id: string
  jadwal?: {
    rute_asal: string
    rute_tujuan: string
    tanggal: string
    jam_berangkat: string
  }
}

function CekTiketContent() {
  const router = useRouter()
  const [noHp, setNoHp] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil] = useState<Tiket[]>([])
  const [error, setError] = useState('')
  const [sudahCari, setSudahCari] = useState(false)

  const klikCount = useRef(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleTombolCariKlik = (e: React.MouseEvent) => {
    klikCount.current += 1

    if (timerRef.current) clearTimeout(timerRef.current)

    if (klikCount.current === 3) {
      e.preventDefault()
      klikCount.current = 0
      router.push('/superadmin')
    } else {
      timerRef.current = setTimeout(() => {
        klikCount.current = 0
      }, 1000)
    }
  }

  const handleCari = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noHp) return

    setLoading(true)
    setError('')
    setHasil([])
    setSudahCari(true)

    const { data, error: err } = await supabase
      .from('pesanan')
      .select(`
        id, nama_penumpang, kode_tiket, status, waktu_pesan, grup_transaksi_id, jadwal_id,
        jadwal:jadwal_id (rute_asal, rute_tujuan, tanggal, jam_berangkat)
      `)
      .eq('nomor_hp', noHp)
      .in('status', ['pending', 'paid'])
      .order('waktu_pesan', { ascending: false })

    if (err) {
      setError('Gagal mencari tiket: ' + err.message)
    } else if (data) {
      const sekarang = new Date().getTime()
      const validTiket = data.filter(t => {
        if (t.status === 'paid') return true
        const waktuPesan = new Date(t.waktu_pesan).getTime()
        const selisihMenit = (sekarang - waktuPesan) / 60000
        return selisihMenit <= 10
      })
      setHasil(validTiket as unknown as Tiket[])
    }
    
    setLoading(false)
  }

  const handleLanjutBayar = (grupId: string) => {
    const tiketGrup = hasil.filter(t => t.grup_transaksi_id === grupId && t.status === 'pending')
    const ids = tiketGrup.map(t => t.id).join(',')
    router.push(`/pembayaran?pesanan=${ids}`)
  }

  const handleLihatEtiket = (grupId: string, idPesanan: string) => {
    const tiketGrup = hasil.filter(t => t.grup_transaksi_id === grupId && t.status === 'paid')
    const ids = tiketGrup.length > 0 ? tiketGrup.map(t => t.id).join(',') : idPesanan
    router.push(`/etiket?pesanan=${ids}`)
  }

  return (
    <div className="min-h-[100dvh] bg-gray-100 flex flex-col items-center pt-12 pb-8 px-4 overflow-y-auto">
      <div className="max-w-md w-full bg-white p-6 md:p-8 rounded-xl shadow-md mb-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cek Tiket</h1>
          <p className="text-sm text-gray-600 mt-2">
            Masukkan Nomor HP yang digunakan saat pembelian.
          </p>
        </div>

        <form onSubmit={handleCari} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP</label>
            <input
              type="tel"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              value={noHp}
              onChange={(e) => setNoHp(e.target.value.replace(/\D/g, ''))}
              placeholder="Contoh: 081234567890"
            />
          </div>
          <button
            type="submit"
            onClick={handleTombolCariKlik}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Mencari...' : 'Cari Tiket'}
          </button>
        </form>

        {error && <p className="text-red-600 text-sm mt-4 text-center">{error}</p>}

        {sudahCari && !loading && hasil.length === 0 && !error && (
          <div className="mt-6 text-center text-gray-500 text-sm">
            Tidak ada tiket aktif ditemukan untuk nomor ini.
          </div>
        )}
      </div>

      {/* HASIL PENCARIAN DIPISAH DARI FORM UTAMA */}
      {hasil.length > 0 && (
        <div className="w-full max-w-md space-y-3">
          <h2 className="font-bold text-gray-900 px-1">Hasil Pencarian:</h2>
          {hasil.map((t) => (
            <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-gray-900">{t.nama_penumpang}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  t.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {t.status === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mb-1">Kode: {t.kode_tiket}</p>
              
              {t.jadwal && (
                <p className="text-[11px] text-blue-700 font-medium mb-3">
                  {t.jadwal.rute_asal} - {t.jadwal.rute_tujuan} <br/>
                  {new Date(t.jadwal.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} | {t.jadwal.jam_berangkat.substring(0, 5)}
                </p>
              )}
              
              {t.status === 'pending' ? (
                <button
                  onClick={() => handleLanjutBayar(t.grup_transaksi_id)}
                  className="w-full bg-orange-500 text-white py-2 rounded-md text-sm font-bold hover:bg-orange-600 transition-colors"
                >
                  Lanjutkan Pembayaran
                </button>
              ) : (
                <button 
                  onClick={() => handleLihatEtiket(t.grup_transaksi_id, t.id)}
                  className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-bold hover:bg-blue-700 transition-colors"
                >
                  Lihat E-Tiket
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-center w-full max-w-md">
        <Link href="/" className="text-sm text-blue-600 hover:underline font-medium">
          ← Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}

export default function CekTiketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Memuat...</div>}>
      <CekTiketContent />
    </Suspense>
  )
}