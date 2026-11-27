'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'
import { fetchPublik } from '@/lib/publikFetch'
import { ambilPesananPublik, type PesananPublik } from '@/lib/publikPesanan'
import { formatJam } from '@/lib/periode'

type PesananItem = PesananPublik

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
}

/** Satu baris dari /api/publik/metode (biaya layanan per kanal). */
type MetodeBayar = {
  kode: string
  nama: string
  tipe: string
  biayaLayanan: number
  total: number
  settlementHari: number | null
  manual: boolean
}

const rp = (nilai: number) => 'Rp ' + Math.max(0, Math.round(nilai)).toLocaleString('id-ID')

/**
 * Tulisan layar pembayaran mengikuti kanal yang dipilih pembeli. Tanpa gateway
 * semuanya masih simulasi, tapi minimal tidak menyesatkan (pilih Alfamart
 * jangan ditampilkan QR).
 */
function labelKanal(tipe: string): { judul: string; baris: [string, string] } {
  switch (tipe) {
    case 'qris':
      return { judul: 'Scan QR ini untuk membayar (mode simulasi)', baris: ['QR Code', '(simulasi)'] }
    case 'va':
      return { judul: 'Nomor Virtual Account (mode simulasi)', baris: ['Nomor VA', '(simulasi)'] }
    case 'retail':
      return { judul: 'Bayar di kasir Alfamart / Indomaret (mode simulasi)', baris: ['Kode Bayar', '(simulasi)'] }
    case 'ewallet':
      return { judul: 'Buka aplikasi e-wallet pilihanmu (mode simulasi)', baris: ['E-Wallet', '(simulasi)'] }
    case 'manual':
      return { judul: 'Transfer ke rekening platform (mode simulasi)', baris: ['Instruksi', 'Transfer'] }
    default:
      return { judul: 'Ikuti instruksi pembayaran (mode simulasi)', baris: ['Instruksi', '(simulasi)'] }
  }
}

function LayarMemuat({ teks }: { teks: string }) {
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center justify-center">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-custom { animation: spin 1s linear infinite; }
      `}} />
      <div className="relative w-24 h-24 flex items-center justify-center mb-4">
        <div className="absolute w-24 h-24 rounded-full border-4 border-transparent border-t-red-500 border-r-yellow-400 border-b-green-500 border-l-blue-500 animate-spin-custom"></div>
        <div className="text-xs font-bold text-gray-500">Memuat...</div>
      </div>
      <p className="text-gray-700 font-medium text-sm">{teks}</p>
    </div>
  )
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

  // Biaya layanan per metode (dari server) + metode yang sedang dikonfirmasi.
  const [metode, setMetode] = useState<MetodeBayar[]>([])
  const [termurah, setTermurah] = useState<string | null>(null)
  const [dasar, setDasar] = useState<number | null>(null)
  const [memuatMetode, setMemuatMetode] = useState(true)
  const [metodePilih, setMetodePilih] = useState<MetodeBayar | null>(null)
  const [konfirmasi, setKonfirmasi] = useState(false)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      try {
        const { data: p, error: errP } = await ambilPesananPublik(pesananIds)

        if (errP) throw new Error(errP)
        if (!p || p.length === 0) {
          setError('Data pesanan tidak ditemukan di database.')
          setLoading(false)
          return
        }

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

  // Biaya layanan tiap metode dihitung SERVER (tarif bisa diubah Superadmin,
  // jadi jangan disalin ke browser). Nominal dasar juga dari server.
  useEffect(() => {
    if (pesananIds.length === 0) {
      setMemuatMetode(false)
      return
    }

    let dibatalkan = false
    setMemuatMetode(true)

    fetchPublik(`/api/publik/metode?pesanan=${encodeURIComponent(pesananIds.join(','))}`)
      .then((res) => res.json())
      .then((hasil) => {
        if (dibatalkan) return
        if (Array.isArray(hasil?.metode) && hasil.metode.length > 0) {
          setMetode(hasil.metode as MetodeBayar[])
          setTermurah(typeof hasil.termurah === 'string' ? hasil.termurah : null)
          if (typeof hasil.dasar === 'number') setDasar(hasil.dasar)
        }
      })
      .catch(() => {
        // Daftar biaya gagal dimuat: halaman tetap bisa dipakai lewat tombol
        // cadangan (tanpa rincian biaya), jangan sampai pembeli terhenti.
      })
      .finally(() => {
        if (!dibatalkan) setMemuatMetode(false)
      })

    return () => {
      dibatalkan = true
    }
  }, [pesananIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBatal() {
    if (pesananList.length === 0) return
    const ids = pesananList.map(p => p.id)

    try {
      const res = await fetchPublik('/api/publik/batal', {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
      const hasil = await res.json()
      if (!res.ok) throw new Error(hasil.error || 'Gagal membatalkan pesanan.')
      setPesananList([])
    } catch (err: any) {
      setError(err.message || 'Gagal membatalkan pesanan.')
      return
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

    const ids = pesananList.map((p) => p.id)

    try {
      // Pembayaran diproses SERVER (mode simulasi). Browser tidak lagi punya
      // izin mengubah status pesanan/kursi, jadi tidak bisa memalsukan lunas.
      const response = await fetchPublik('/api/publik/bayar', {
        method: 'POST',
        // `metode` hanya dicatat sebagai pilihan pembeli (tidak mengubah harga:
        // biaya layanan tidak ditagihkan/dipotong di mode simulasi).
        body: JSON.stringify({ ids, metode: metodePilih?.kode || null })
      })

      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal memproses pembayaran.')

      // 4. Redirect ke E-Tiket
      router.replace(`/etiket?pesanan=${ids.join(',')}`)
    } catch (err: any) {
      console.error('Error di handleBayarOnline:', err)
      setError(err.message || 'Terjadi kesalahan saat memproses pembayaran.')
      setSedangBayar(false)
    }
  }

  if (loading) return <LayarMemuat teks="Menyiapkan pembayaran..." />
  if (error && !detail) return <p className="p-6 text-center text-red-600 font-bold mt-10">Error: {error}</p>
  if (pesananList.length === 0 || !detail) return <p className="p-6 text-center text-gray-900 mt-10">Data pesanan tidak lengkap.</p>

  const jumlahDewasa = pesananList.filter(p => !p.is_balita).length
  const totalHarga = detail.harga * jumlahDewasa
  // Teks instruksi mengikuti kanal yang dipilih (semua masih simulasi).
  const kanal = labelKanal(metodePilih?.tipe || '')

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
                <span className="font-medium text-gray-900">{formatJam(detail.jam_berangkat)}</span>
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
              <span className="font-bold text-sm md:text-base text-gray-900">Harga Tiket</span>
              <span className="font-bold text-blue-600 text-base md:text-lg">Rp {totalHarga.toLocaleString('id-ID')}</span>
            </div>
            <p className="text-[10px] md:text-xs text-gray-500 mt-1 text-right">
              Belum termasuk biaya layanan — lihat daftar di bawah.
            </p>
          </div>

          {step === 'pilih' && (
            <div className="bg-white p-4 md:p-5 rounded-lg shadow-sm border border-gray-200">
              <h2 className="font-bold text-gray-900 text-sm md:text-base">Pilih Metode Pembayaran</h2>
              <p className="text-[11px] md:text-xs text-gray-600 mt-1 mb-3">
                Ini <b>hanya informasi biaya layanan</b> tiap kanal. Kanal tetap kamu
                yang pilih dan bisa berubah kapan saja sebelum membayar — harga tiket
                dan hak pemilik kapal tidak berubah sedikit pun.
              </p>

              {memuatMetode && (
                <p className="text-xs text-gray-500 py-4 text-center">Menghitung biaya layanan...</p>
              )}

              {!memuatMetode && metode.length > 0 && (
                <div className="space-y-2">
                  {metode.map((m) => {
                    const termurahIni = termurah === m.kode
                    return (
                      <button
                        key={m.kode}
                        onClick={() => { setMetodePilih(m); setKonfirmasi(true) }}
                        className={`w-full text-left px-3 py-2.5 md:py-3 rounded-lg border transition-colors bg-white text-gray-900 ${
                          termurahIni ? 'border-green-500 hover:bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-xs md:text-sm font-semibold">
                              {m.nama}
                              {termurahIni && (
                                <span className="ml-1.5 align-middle text-[9px] md:text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                                  TERMURAH
                                </span>
                              )}
                            </span>
                            <span className="block text-[10px] md:text-xs text-gray-500 mt-0.5">
                              {m.manual
                                ? 'Diverifikasi admin'
                                : m.settlementHari != null
                                  ? `Dana cair H+${m.settlementHari}`
                                  : 'Tanpa biaya layanan'}
                            </span>
                          </span>
                          <span className="text-right whitespace-nowrap">
                            <span className={`block text-[10px] md:text-xs ${m.biayaLayanan > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {m.biayaLayanan > 0 ? `+ ${rp(m.biayaLayanan)}` : 'Gratis biaya'}
                            </span>
                            <span className="block text-xs md:text-sm font-bold">{rp(m.total)}</span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {!memuatMetode && metode.length === 0 && (
                <button
                  onClick={() => setStep('qris')}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium text-left px-4 transition-colors shadow-sm"
                >
                  <span className="block text-sm md:text-base">💳 Transfer / QRIS (Online)</span>
                  <span className="block text-[10px] md:text-xs font-normal mt-0.5 opacity-90">
                    Bayar dari rumah lewat HP. E-tiket langsung terbit.
                  </span>
                </button>
              )}

              <p className="text-[10px] md:text-xs text-gray-500 mt-3">
                Total = {rp(dasar ?? totalHarga)} (harga tiket) + biaya layanan metode yang dipilih.
              </p>
            </div>
          )}

          {step === 'qris' && (
            <div className="bg-white p-4 md:p-5 rounded-lg shadow-sm text-center text-gray-900 border border-gray-200">
              {metodePilih && (
                <div className="mb-2 md:mb-3">
                  <p className="text-xs md:text-sm font-semibold">{metodePilih.nama}</p>
                  <p className="text-[11px] md:text-xs text-gray-600">
                    {rp(metodePilih.total - metodePilih.biayaLayanan)} + biaya layanan{' '}
                    {metodePilih.biayaLayanan > 0 ? rp(metodePilih.biayaLayanan) : 'gratis'}
                  </p>
                  <p className="text-sm md:text-base font-bold text-blue-600 mt-0.5">
                    Total: {rp(metodePilih.total)}
                  </p>
                </div>
              )}
              <p className="text-xs md:text-sm text-gray-600 mb-2 md:mb-3">{kanal.judul}</p>
              
              <div className="bg-gray-50 w-32 h-32 md:w-48 md:h-48 mx-auto flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
                <span className="text-gray-400 text-xs md:text-sm font-medium text-center">
                  {kanal.baris[0]}
                  <br />
                  {kanal.baris[1]}
                </span>
              </div>
              
              <p className="text-[10px] md:text-xs text-red-600 font-bold mt-2 md:mt-3 bg-red-50 inline-block px-3 py-1 rounded-full">
                ⏳ Batas waktu: 5 menit
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
                {sedangBayar
                  ? 'Memproses...'
                  : `✓ Saya Sudah Bayar${metodePilih ? ' ' + rp(metodePilih.total) : ` (${jumlahDewasa} tiket)`}`}
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

      {/* Popup pengingat: total yang dibayar SUDAH termasuk biaya layanan. */}
      {konfirmasi && metodePilih && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center md:p-4">
          <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-xl p-4 md:p-5 shadow-xl text-gray-900">
            <h3 className="font-bold text-base md:text-lg">Konfirmasi Pembayaran</h3>
            <p className="text-[11px] md:text-xs text-gray-600 mt-0.5 mb-3">
              Ringkasan biaya — keputusan metode tetap milikmu, belum ada dana yang ditarik.
            </p>

            <div className="text-[11px] md:text-sm space-y-1.5 border-t border-gray-200 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Metode</span>
                <span className="font-medium text-right">{metodePilih.nama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Harga tiket</span>
                <span className="font-medium">{rp(metodePilih.total - metodePilih.biayaLayanan)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Biaya layanan</span>
                <span className={`font-medium ${metodePilih.biayaLayanan > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {metodePilih.biayaLayanan > 0 ? rp(metodePilih.biayaLayanan) : 'Gratis'}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5">
                <span className="font-bold">Total dibayar</span>
                <span className="font-bold text-blue-600">{rp(metodePilih.total)}</span>
              </div>
            </div>

            <p className="text-[10px] md:text-xs text-gray-500 mt-3">
              {metodePilih.manual
                ? 'Transfer manual: kirim sesuai nominal + kode bayar, lalu tunggu verifikasi admin.'
                : 'Pembayaran diverifikasi otomatis oleh gateway; e-tiket terbit setelah dana diterima.'}
            </p>
            <p className="text-[10px] md:text-xs text-gray-400 mt-1">
              Biaya layanan ditanggung pembeli dan tidak memotong hak pemilik kapal.
              Kamu masih bisa ganti metode lewat tombol di bawah.
            </p>

            <button
              onClick={() => { setStep('qris'); setKonfirmasi(false) }}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-bold text-sm md:text-base shadow-sm transition-colors"
            >
              Lanjut Bayar {rp(metodePilih.total)}
            </button>
            <button
              onClick={() => setKonfirmasi(false)}
              className="w-full mt-1 text-gray-600 py-2 text-xs md:text-sm hover:underline font-medium"
            >
              Pilih metode lain
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default function PembayaranPage() {
  return (
    <Suspense fallback={<LayarMemuat teks="Menyiapkan pembayaran..." />}>
      <PembayaranContent />
    </Suspense>
  )
}