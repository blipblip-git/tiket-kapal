'use client'

// app/laporan-fee-rinci/page.tsx
// Rincian penjualan agen per jam & kapal (dibuka dari tombol RINCI pada
// Laporan Fee Harian / Bulanan).
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, type Profile } from '@/lib/supabase'
import { muatRincianFee, type PenjualFee, type RincianFee } from '@/lib/laporanFee'
import { kodeUntukLokasi, petaKodeKota, feeProfil } from '@/lib/fee'
import { formatRupiah, formatTanggalPendek } from '@/lib/periode'

function LaporanFeeRinciContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasiParam = searchParams.get('lokasi') || ''
  const agenParam = searchParams.get('agen') || ''
  const tanggalParam = searchParams.get('tanggal') || ''
  const jamParam = searchParams.get('jam') || ''
  const kapalParam = searchParams.get('kapal') || ''
  const sayaParam = searchParams.get('saya') === '1'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [penjual, setPenjual] = useState<PenjualFee | null>(null)
  const [baris, setBaris] = useState<RincianFee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sayaSendiri = sayaParam || profile?.role === 'agen'

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) currentProfile = await getProfile()
      if (!currentProfile) { router.push('/login'); return }
      setProfile(currentProfile)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!profile) return
      if (!tanggalParam) {
        setError('Tanggal rincian tidak ditemukan.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')

      const petaKota = await petaKodeKota()
      const idPenjual = sayaSendiri ? String(profile.id) : agenParam
      let dataPenjual: any = null

      if (idPenjual) {
        const { data } = await supabase.from('profiles').select('*').eq('id', idPenjual).maybeSingle()
        dataPenjual = data
      }

      if (!dataPenjual) {
        setError('Data agen tidak ditemukan.')
        setLoading(false)
        return
      }

      const infoPenjual: PenjualFee = {
        id: dataPenjual.id,
        nama: String(dataPenjual.nama || '-'),
        email: String(dataPenjual.email || ''),
        nomor_hp: String(dataPenjual.nomor_hp || ''),
        lokasi: String(dataPenjual.lokasi || ''),
        fee: feeProfil(dataPenjual),
        kode: kodeUntukLokasi(String(dataPenjual.lokasi || ''), petaKota)
      }
      setPenjual(infoPenjual)

      const hasil = await muatRincianFee({
        penjual: infoPenjual,
        tanggal: tanggalParam,
        jam: jamParam,
        kapal: kapalParam
      })

      if (hasil.error) {
        setError(hasil.error)
        setBaris([])
      } else {
        setBaris(hasil.baris)
      }
      setLoading(false)
    }
    fetchData()
  }, [profile, sayaSendiri, agenParam, tanggalParam, jamParam, kapalParam])

  const kembali = () => {
    const dasar = sayaSendiri ? '/laporan-fee-harian?saya=1' : `/laporan-fee-harian?lokasi=${encodeURIComponent(lokasiParam)}`
    router.push(`${dasar}&tanggal=${tanggalParam}`)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!penjual) return null

  const totalTiket = baris.length
  const totalUang = baris.reduce((sum, b) => sum + b.harga, 0)
  const totalFee = totalTiket * penjual.fee

  return (
    <div className="print-container min-h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-3xl w-full mx-auto">
        <div className="flex justify-between items-start gap-2 mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-sm md:text-xl font-bold text-gray-900 leading-tight">Rincian Penjualan Agen</h1>
            <p className="text-[10px] md:text-sm font-bold text-red-600 mt-0.5">
              {penjual.nama} - {penjual.lokasi || '-'} / {penjual.kode}
            </p>
            <p className="text-[10px] md:text-xs text-gray-600 mt-0.5">
              {jamParam || '-'} &bull; {kapalParam || '-'} &bull; {formatTanggalPendek(tanggalParam)}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setTimeout(() => window.print(), 100)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
            <button onClick={kembali} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition">Kembali</button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] md:text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-center w-10">NO</th>
                  <th className="px-2 py-2 text-left">NAMA</th>
                  <th className="px-2 py-2 text-center w-14">KURSI</th>
                  <th className="px-2 py-2 text-left">KODE</th>
                  <th className="px-2 py-2 text-left">METODE</th>
                  <th className="px-2 py-2 text-right">HARGA</th>
                </tr>
              </thead>
              <tbody>
                {baris.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-gray-500">Tidak ada penjualan pada jam ini.</td>
                  </tr>
                )}
                {baris.map((item, idx) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-center text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-gray-900">{item.nama_penumpang}</td>
                    <td className="px-2 py-1.5 text-center text-gray-900">{item.kursi}</td>
                    <td className="px-2 py-1.5 text-gray-600 font-mono text-[9px] md:text-xs">{item.kode_tiket}</td>
                    <td className="px-2 py-1.5 text-gray-700 uppercase">{item.metode}</td>
                    <td className="px-2 py-1.5 text-right text-gray-900">{formatRupiah(item.harga)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-red-100 bg-red-50/50">
                  <td colSpan={2} className="px-2 py-1.5 text-right font-bold text-gray-900">Total</td>
                  <td className="px-2 py-1.5 text-center font-bold text-gray-900">{totalTiket}</td>
                  <td colSpan={2} className="px-2 py-1.5 text-right text-[10px] md:text-xs text-gray-600">Fee {formatRupiah(penjual.fee)}/tiket</td>
                  <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatRupiah(totalUang)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-3 py-2 flex items-center">
            <p className="text-[10px] md:text-sm font-bold text-gray-900">TOTAL FEE</p>
            <p className="ml-auto text-sm md:text-lg font-bold text-red-700">{formatRupiah(totalFee)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LaporanFeeRinciPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400">Memuat...</p>}>
      <LaporanFeeRinciContent />
    </Suspense>
  )
}
