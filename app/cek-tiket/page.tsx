'use client'

import { useState, useRef, Suspense } from 'react'
import { cariTiketPublik } from '@/lib/publikPesanan'
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
  is_balita: boolean
  induk_id: string | null
  jadwal?: {
    rute_asal: string
    rute_tujuan: string
    tanggal: string
    jam_berangkat: string
  }
}

type KartuTiket = {
  utama: Tiket
  balita: Tiket[]
}

// Pintu rahasia: 3x klik tombol "Cari Tiket" (jeda antar klik maksimal 2 detik)
// membuka /superadmin. Aktif di REAL. Di DEMO pintu ini dimatikan — area
// Superadmin demo dibuka lewat URL /superadmin langsung (lihat proxy.ts), supaya
// pengunjung demo tidak tersandung ke pintu pemilik platform.
const MODE_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const JEDA_KLIK_MS = 2000
/**
 * Satu kartu = satu tiket dewasa + balita yang menempel padanya.
 * Baris balita tidak ditampilkan sebagai kartu terpisah supaya pembeli
 * cukup melihat/menyimpan satu boarding pass per orang tua.
 */
function susunKartu(daftar: Tiket[]): KartuTiket[] {
  const dewasa = daftar.filter((t) => !t.is_balita)
  const balita = daftar.filter((t) => t.is_balita)
  const terpakai = new Set<string>()

  const kartu = dewasa.map((utama) => {
    const anak = balita.filter((b) => {
      if (terpakai.has(b.id)) return false
      if (b.induk_id) return b.induk_id === utama.id
      // Data lama: induk_id kosong. Tempelkan ke dewasa pertama di grup yang sama.
      if (!b.grup_transaksi_id) return false
      const dewasaPertama = dewasa.find((d) => d.grup_transaksi_id === b.grup_transaksi_id)
      return dewasaPertama?.id === utama.id
    })
    anak.forEach((b) => terpakai.add(b.id))
    return { utama, balita: anak }
  })

  // Balita yatim (tanpa baris dewasa) tetap ditampilkan apa adanya.
  const sisa = balita.filter((b) => !terpakai.has(b.id))
  return [...kartu, ...sisa.map((b) => ({ utama: b, balita: [] as Tiket[] }))]
}

function CekTiketContent() {
  const router = useRouter()
  const [noHp, setNoHp] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil] = useState<Tiket[]>([])
  const [error, setError] = useState('')
  const [sudahCari, setSudahCari] = useState(false)

  // Pintu 3x di tombol Cari (khusus REAL, dimatikan di DEMO).
  const klikCari = useRef(0)
  const timerCari = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTombolCariKlik = (e: React.MouseEvent) => {
    if (MODE_DEMO) return

    klikCari.current += 1
    if (timerCari.current) clearTimeout(timerCari.current)

    if (klikCari.current >= 3) {
      e.preventDefault()
      klikCari.current = 0
      router.push('/superadmin')
      return
    }

    timerCari.current = setTimeout(() => {
      klikCari.current = 0
    }, JEDA_KLIK_MS)
  }

  const handleCari = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noHp) return

    setLoading(true)
    setError('')
    setHasil([])
    setSudahCari(true)

    const { data, error: err } = await cariTiketPublik(noHp)

    if (err) {
      setError('Gagal mencari tiket: ' + err)
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

  const handleLihatEtiket = (utama: Tiket, balita: Tiket[]) => {
    const ids = [utama.id, ...balita.map((b) => b.id)].join(',')
    router.push(`/etiket?pesanan=${ids}`)
  }

  const kartu = susunKartu(hasil)

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
          {kartu.map(({ utama, balita }) => {
            const semuaLunas = utama.status === 'paid' && balita.every((b) => b.status === 'paid')
            const jumlahOrang = 1 + balita.length
            return (
              <div key={utama.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-900">
                    {utama.nama_penumpang}
                    {utama.is_balita && <span className="text-[10px] text-orange-600 ml-1">(Balita)</span>}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    semuaLunas ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {semuaLunas ? 'LUNAS' : 'BELUM BAYAR'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono mb-1">Kode: {utama.kode_tiket}</p>

                {balita.length > 0 && (
                  <div className="text-[11px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-2 py-1 mb-2">
                    <p className="font-semibold">Balita: {balita.map((b) => b.nama_penumpang).join(', ')}</p>
                    <p className="text-[10px] text-orange-600">{jumlahOrang} orang (1 dewasa + {balita.length} balita)</p>
                  </div>
                )}

                {utama.jadwal && (
                  <p className="text-[11px] text-blue-700 font-medium mb-3">
                    {utama.jadwal.rute_asal} - {utama.jadwal.rute_tujuan} <br/>
                    {new Date(utama.jadwal.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} | {utama.jadwal.jam_berangkat.substring(0, 5)}
                  </p>
                )}

                {semuaLunas ? (
                  <button
                    onClick={() => handleLihatEtiket(utama, balita)}
                    className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Lihat E-Tiket
                  </button>
                ) : (
                  <button
                    onClick={() => handleLanjutBayar(utama.grup_transaksi_id)}
                    className="w-full bg-orange-500 text-white py-2 rounded-md text-sm font-bold hover:bg-orange-600 transition-colors"
                  >
                    Lanjutkan Pembayaran
                  </button>
                )}
              </div>
            )
          })}
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