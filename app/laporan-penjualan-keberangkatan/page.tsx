'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, type Profile } from '@/lib/supabase'

type LaporanDetail = {
  id: string
  nama_penumpang: string
  kursi: string
  kode_tiket: string
  metode: string
  harga: number
}

type LaporanJam = {
  jam: string
  total_penumpang: number
  total_cash: number
  total_qris: number
  total_pendapatan: number
  detail: LaporanDetail[]
}

export default function LaporanPenjualanKeberangkatanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tanggal, setTanggal] = useState('')
  
  const [laporan, setLaporan] = useState<LaporanJam[]>([])
  const [jamTerpilih, setJamTerpilih] = useState<string | null>(null)
  const [printMode, setPrintMode] = useState<'rekap' | 'rincian'>('rekap')

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi) {
      router.push('/login')
      return
    }
    setProfile(sesi)
    
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - offset * 60 * 1000)
    setTanggal(localDate.toISOString().split('T')[0])
  }, [router])

  useEffect(() => {
    if (profile && tanggal) {
      loadLaporan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, tanggal])

  async function loadLaporan() {
    if (!profile) return
    setLoading(true)

    // KUERY INI MENGUNCI DATA: 
    // Hanya mengambil data dengan kanal 'keberangkatan' dan petugas_jual sesuai email yang login.
    const { data, error } = await supabase
      .from('pesanan')
      .select(`
        id, nama_penumpang, kode_tiket,
        jadwal:jadwal_id (harga, rute_asal, rute_tujuan, jam_berangkat, tanggal),
        kursi:kursi_id (nomor_kursi),
        pembayaran:pembayaran (metode)
      `)
      .eq('status', 'paid')
      .eq('kanal', 'keberangkatan')
      .eq('petugas_jual', profile.email)

    if (error) {
      console.error('Gagal load laporan:', error)
      setLoading(false)
      return
    }

    const filteredData = data.filter((item: any) => {
      const cocokTanggal = item.jadwal?.tanggal === tanggal
      const cocokLokasi = item.jadwal?.rute_asal === profile.lokasi
      return cocokTanggal && cocokLokasi
    })

    const grouped: Record<string, LaporanJam> = {}

    filteredData.forEach((item: any) => {
      const jamKapal = item.jadwal?.jam_berangkat
      const jamStr = jamKapal ? jamKapal.slice(0, 5) : '00:00'
      
      const harga = item.jadwal?.harga || 0
      const kursi = item.kursi?.nomor_kursi || '-'
      
      let metode = 'cash'
      if (Array.isArray(item.pembayaran) && item.pembayaran.length > 0) {
        metode = item.pembayaran[0].metode
      } else if (item.pembayaran && item.pembayaran.metode) {
        metode = item.pembayaran.metode
      }

      if (!grouped[jamStr]) {
        grouped[jamStr] = {
          jam: jamStr,
          total_penumpang: 0,
          total_cash: 0,
          total_qris: 0,
          total_pendapatan: 0,
          detail: [],
        }
      }

      grouped[jamStr].total_penumpang += 1
      grouped[jamStr].total_pendapatan += harga
      
      if (metode === 'cash' || metode === 'cash_loket') {
        grouped[jamStr].total_cash += harga
      } else {
        grouped[jamStr].total_qris += harga
      }

      grouped[jamStr].detail.push({
        id: item.id,
        nama_penumpang: item.nama_penumpang,
        kursi,
        kode_tiket: item.kode_tiket,
        metode,
        harga,
      })
    })

    const sorted = Object.values(grouped).sort((a, b) => a.jam.localeCompare(b.jam))
    setLaporan(sorted)
    setLoading(false)
  }

  const handlePrint = (mode: 'rekap' | 'rincian') => {
    setPrintMode(mode)
    setTimeout(() => window.print(), 100)
  }

  const grandTotal = laporan.reduce(
    (acc, curr) => ({
      penumpang: acc.penumpang + curr.total_penumpang,
      cash: acc.cash + curr.total_cash,
      qris: acc.qris + curr.total_qris,
      pendapatan: acc.pendapatan + curr.total_pendapatan,
    }),
    { penumpang: 0, cash: 0, qris: 0, pendapatan: 0 }
  )

  const dataTerpilih = laporan.find((l) => l.jam === jamTerpilih)

  const potongKode = (kode: string) => {
    if (!kode) return '-'
    return kode.length > 6 ? `...${kode.slice(-6)}` : kode
  }

  const formatTanggal = (tgl: string) => {
    if (!tgl) return '-'
    const [year, month, day] = tgl.split('-')
    return `${day}/${month}/${year}`
  }

  const asal = profile?.lokasi || 'Tarakan'
  const tujuan = asal === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'
  const teksRute = `${asal} - ${tujuan}`

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:bg-white print:block">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-rekap-only { display: ${printMode === 'rekap' ? 'block' : 'none'} !important; }
          .print-rincian-only { display: ${printMode === 'rincian' ? 'block' : 'none'} !important; }
        }
      `}} />

      {/* HEADER (Fixed) */}
      <div className="flex-shrink-0 bg-white shadow-sm z-10 p-4 print-hidden">
        <div className="max-w-md md:max-w-5xl mx-auto">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Laporan Penjualan</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">Petugas : {profile?.nama} ({profile?.lokasi})</p>
            </div>
            <button onClick={() => router.push('/pusat-laporan-keberangkatan')} className="text-[10px] md:text-sm text-blue-600 hover:underline bg-gray-50 px-2 py-1 md:px-3 md:py-1.5 rounded border border-gray-200 mt-1">
              &larr; Kembali
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-2 md:p-3 rounded-lg">
            <label className="block text-[10px] md:text-sm font-bold text-gray-700 mb-1">Pilih Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => {
                setTanggal(e.target.value)
                setJamTerpilih(null)
              }}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 md:py-2 text-xs md:text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* AREA TENGAH (Scrollable) */}
      <div className="flex-1 overflow-y-auto w-full p-3 md:p-6 print-hidden">
        <div className="max-w-md md:max-w-5xl mx-auto">
          
          {!jamTerpilih && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
              {loading ? (
                <p className="p-4 text-center text-gray-600 text-xs md:text-base">Memuat data...</p>
              ) : laporan.length === 0 ? (
                <p className="p-4 text-center text-gray-600 text-xs md:text-base">Tidak ada penjualan di tanggal ini.</p>
              ) : (
                <>
                  <div className="bg-blue-600 px-3 py-2 md:px-4 md:py-3 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-white font-bold text-[10px] md:text-base">Rekapan Penjualan</h2>
                    <span className="text-white font-medium text-[9px] md:text-sm">{teksRute}</span>
                    <button onClick={() => handlePrint('rekap')} className="bg-white text-blue-700 px-2 py-0.5 md:px-4 md:py-1.5 rounded text-[9px] md:text-sm font-bold hover:bg-gray-100">🖨️ Cetak</button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] md:text-sm">
                      <thead className="bg-gray-200 border-b text-center text-gray-900">
                        <tr>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300 w-10 md:w-auto" rowSpan={2}>Jam</th>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300" colSpan={4}>Total</th>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300 w-12 md:w-auto" rowSpan={2}>Aksi</th>
                        </tr>
                        <tr>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Penumpang</th>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Cash</th>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Qris</th>
                          <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Penjualan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporan.map((l) => (
                          <tr key={l.jam} className="border-b last:border-0 hover:bg-gray-50 text-center">
                            <td className="px-1 py-1 md:px-4 md:py-2 font-bold text-gray-900 border border-gray-300">{l.jam}</td>
                            <td className="px-1 py-1 md:px-4 md:py-2 text-blue-600 font-bold border border-gray-300">{l.total_penumpang}</td>
                            <td className="px-1 py-1 md:px-4 md:py-2 text-gray-700 border border-gray-300">Rp {l.total_cash.toLocaleString('id-ID')}</td>
                            <td className="px-1 py-1 md:px-4 md:py-2 text-gray-700 border border-gray-300">Rp {l.total_qris.toLocaleString('id-ID')}</td>
                            <td className="px-1 py-1 md:px-4 md:py-2 font-bold text-gray-900 border border-gray-300">Rp {l.total_pendapatan.toLocaleString('id-ID')}</td>
                            <td className="px-1 py-1 md:px-4 md:py-2 text-center border border-gray-300">
                              <button onClick={() => setJamTerpilih(l.jam)} className="bg-green-100 text-green-800 px-1.5 py-0.5 md:px-3 md:py-1 rounded text-[8px] md:text-xs font-bold hover:bg-green-200">Rinci</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-600 text-white font-bold text-center">
                        <tr>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">TOTAL</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">{grandTotal.penumpang}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {grandTotal.cash.toLocaleString('id-ID')}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {grandTotal.qris.toLocaleString('id-ID')}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {grandTotal.pendapatan.toLocaleString('id-ID')}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {jamTerpilih && dataTerpilih && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-blue-600 px-3 py-2 md:px-4 md:py-3 flex justify-between items-center">
                <h2 className="text-white font-bold text-[10px] md:text-base">Rincian Jam {jamTerpilih}</h2>
                <span className="text-white font-medium text-[9px] md:text-sm">{teksRute}</span>
                <div className="flex gap-1 md:gap-2 flex-shrink-0">
                  <button onClick={() => handlePrint('rincian')} className="bg-white text-blue-700 px-2 py-0.5 md:px-4 md:py-1.5 rounded text-[9px] md:text-sm font-bold">🖨️ Cetak</button>
                  <button onClick={() => setJamTerpilih(null)} className="bg-blue-700 text-white px-2 py-0.5 md:px-4 md:py-1.5 rounded text-[9px] md:text-sm font-bold">&larr; Kembali</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] md:text-sm">
                  <thead className="bg-gray-200 border-b text-center text-gray-900">
                    <tr>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300 w-6 md:w-auto">No</th>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300 text-center">Nama / Kursi</th>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Kode</th>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Cash</th>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Qris</th>
                      <th className="px-1 py-1 md:px-4 md:py-2 border border-gray-300">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataTerpilih.detail.map((d, idx) => {
                      const isCash = d.metode === 'cash' || d.metode === 'cash_loket';
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 text-center">
                          <td className="px-1 py-1 md:px-4 md:py-2 text-gray-900 font-bold border border-gray-300">{idx + 1}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 font-bold text-gray-900 text-center border border-gray-300">{d.nama_penumpang} / {d.kursi}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 font-mono text-gray-800 border border-gray-300">{potongKode(d.kode_tiket)}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 text-gray-900 border border-gray-300">{isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 text-gray-900 border border-gray-300">{!isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                          <td className="px-1 py-1 md:px-4 md:py-2 font-bold text-gray-900 border border-gray-300">Rp {d.harga.toLocaleString('id-ID')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-blue-600 text-white font-bold text-center">
                    <tr>
                      <td colSpan={3} className="px-1 py-1 md:px-4 md:py-2 border border-blue-700 text-right">TOTAL</td>
                      <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {dataTerpilih.total_cash.toLocaleString('id-ID')}</td>
                      <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {dataTerpilih.total_qris.toLocaleString('id-ID')}</td>
                      <td className="px-1 py-1 md:px-4 md:py-2 border border-blue-700">Rp {dataTerpilih.total_pendapatan.toLocaleString('id-ID')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= TAMPILAN PRINT ================= */}
      
      {/* PRINT REKAP */}
      <div className="hidden print-rekap-only">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Rekapan Laporan Penjualan {teksRute}</h1>
          <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1">
            <span>Petugas</span><span>:</span><span>{profile?.nama}</span>
            <span>Tanggal</span><span>:</span><span>{formatTanggal(tanggal)}</span>
            <span>Rute</span><span>:</span><span>{teksRute}</span>
          </div>
        </div>
        <table className="w-full text-sm border-collapse border border-gray-400">
          <thead>
            <tr className="bg-gray-200 text-center text-gray-900">
              <th className="border border-gray-400 px-2 py-2 w-12" rowSpan={2}>Jam</th>
              <th className="border border-gray-400 px-2 py-2" colSpan={4}>Total</th>
            </tr>
            <tr className="bg-gray-200 text-center text-gray-900">
              <th className="border border-gray-400 px-2 py-1">Penumpang</th>
              <th className="border border-gray-400 px-2 py-1">Cash</th>
              <th className="border border-gray-400 px-2 py-1">Qris</th>
              <th className="border border-gray-400 px-2 py-1">Penjualan</th>
            </tr>
          </thead>
          <tbody>
            {laporan.map((l) => (
              <tr key={l.jam} className="text-center text-gray-900">
                <td className="border border-gray-400 px-2 py-1 font-bold">{l.jam}</td>
                <td className="border border-gray-400 px-2 py-1">{l.total_penumpang}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {l.total_cash.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {l.total_qris.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right font-bold">Rp {l.total_pendapatan.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-300 text-center text-gray-900">
              <td className="border border-gray-400 px-2 py-1">TOTAL</td>
              <td className="border border-gray-400 px-2 py-1">{grandTotal.penumpang}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">Rp {grandTotal.cash.toLocaleString('id-ID')}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">Rp {grandTotal.qris.toLocaleString('id-ID')}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">Rp {grandTotal.pendapatan.toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PRINT RINCIAN */}
      {dataTerpilih && (
        <div className="hidden print-rincian-only">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">Rincian Laporan Penjualan {teksRute}</h1>
            <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1">
              <span>Petugas</span><span>:</span><span>{profile?.nama}</span>
              <span>Tanggal</span><span>:</span><span>{formatTanggal(tanggal)}</span>
              <span>Rute</span><span>:</span><span>{teksRute}</span>
              <span>Jam</span><span>:</span><span>{jamTerpilih}</span>
            </div>
          </div>
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-2 w-10">No</th>
                <th className="border border-gray-400 px-2 py-2 text-center">Nama / Kursi</th>
                <th className="border border-gray-400 px-2 py-2">Kode Tiket</th>
                <th className="border border-gray-400 px-2 py-2">Cash</th>
                <th className="border border-gray-400 px-2 py-2">Qris</th>
                <th className="border border-gray-400 px-2 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {dataTerpilih.detail.map((d, idx) => {
                const isCash = d.metode === 'cash' || d.metode === 'cash_loket';
                return (
                  <tr key={d.id} className="text-center text-gray-900">
                    <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                    <td className="border border-gray-400 px-2 py-1 text-center font-bold">{d.nama_penumpang} / {d.kursi}</td>
                    <td className="border border-gray-400 px-2 py-1 font-mono text-xs">{potongKode(d.kode_tiket)}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{!isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right font-bold">Rp {d.harga.toLocaleString('id-ID')}</td>
                  </tr>
                )
              })}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td colSpan={3} className="border border-gray-400 px-2 py-1 text-right">TOTAL</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {dataTerpilih.total_cash.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {dataTerpilih.total_qris.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {dataTerpilih.total_pendapatan.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}