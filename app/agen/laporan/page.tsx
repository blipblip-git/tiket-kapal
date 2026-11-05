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

export default function LaporanAgenPage() {
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

    const { data, error } = await supabase
      .from('pesanan')
      .select(`
        id, nama_penumpang, kode_tiket,
        jadwal:jadwal_id (harga, rute_asal, rute_tujuan, jam_berangkat, tanggal),
        kursi:kursi_id (nomor_kursi),
        pembayaran:pembayaran (metode)
      `)
      .eq('status', 'paid')

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
    <div className="min-h-screen bg-gray-100 p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-rekap-only { display: ${printMode === 'rekap' ? 'block' : 'none'} !important; }
          .print-rincian-only { display: ${printMode === 'rincian' ? 'block' : 'none'} !important; }
        }
      `}} />

      <div className="max-w-5xl mx-auto">
        
        <div className="flex justify-between items-start mb-6 print-hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
            <p className="text-sm text-gray-600">{profile?.nama}</p>
          </div>
          <button onClick={() => router.push('/dashboard/agen')} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex items-center gap-4 print-hidden">
          <label className="text-sm font-medium text-gray-700">Pilih Tanggal:</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => {
              setTanggal(e.target.value)
              setJamTerpilih(null)
            }}
            className="border rounded px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {/* ================= TAMPILAN LAYAR ================= */}
        <div className="print-hidden">
          {!jamTerpilih && (
            <div className="bg-white rounded shadow overflow-hidden">
              {loading ? (
                <p className="p-6 text-center text-gray-600">Memuat data...</p>
              ) : laporan.length === 0 ? (
                <p className="p-6 text-center text-gray-600">Tidak ada penjualan di tanggal ini.</p>
              ) : (
                <>
                  <div className="bg-blue-600 px-4 py-3 flex justify-between items-center">
                    {/* TAMBAHAN TEKS RUTE DI HEADER LAYAR */}
                    <div className="flex items-center gap-3">
                      <h2 className="text-white font-bold">Rekapan Laporan Penjualan</h2>
                      <span className="text-white font-medium text-sm">{teksRute}</span>
                    </div>
                    <button onClick={() => handlePrint('rekap')} className="bg-white text-blue-700 px-3 py-1 rounded text-sm font-bold hover:bg-gray-100">🖨️ Cetak Rekap</button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-200 border-b text-center text-gray-900">
                      <tr>
                        <th className="px-4 py-2 border" rowSpan={2}>Jam</th>
                        <th className="px-4 py-2 border" rowSpan={2}>Total Penumpang</th>
                        <th className="px-4 py-2 border" colSpan={3}>Penjualan</th>
                        <th className="px-4 py-2 border" rowSpan={2}>Aksi</th>
                      </tr>
                      <tr>
                        <th className="px-4 py-2 border">Cash</th>
                        <th className="px-4 py-2 border">Qris</th>
                        <th className="px-4 py-2 border">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laporan.map((l) => (
                        <tr key={l.jam} className="border-b last:border-0 hover:bg-gray-50 text-center">
                          <td className="px-4 py-3 font-bold text-gray-900">{l.jam}</td>
                          <td className="px-4 py-3 text-blue-600 font-bold">{l.total_penumpang}</td>
                          <td className="px-4 py-3 text-gray-700">Rp {l.total_cash.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3 text-gray-700">Rp {l.total_qris.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">Rp {l.total_pendapatan.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => setJamTerpilih(l.jam)} className="bg-green-100 text-green-800 px-3 py-1 rounded text-xs font-bold hover:bg-green-200">Rincian</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-blue-600 text-white font-bold text-center">
                      <tr>
                        <td className="px-4 py-3 border">TOTAL</td>
                        <td className="px-4 py-3 border">{grandTotal.penumpang}</td>
                        <td className="px-4 py-3 border">Rp {grandTotal.cash.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 border">Rp {grandTotal.qris.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 border">Rp {grandTotal.pendapatan.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 border"></td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          )}

          {jamTerpilih && dataTerpilih && (
            <div className="bg-white rounded shadow overflow-hidden">
              <div className="bg-blue-600 px-4 py-3 flex justify-between items-center">
                {/* TAMBAHAN TEKS RUTE DI HEADER RINCIAN */}
                <div className="flex items-center gap-3">
                  <h2 className="text-white font-bold">Rincian Laporan Penjualan - Jam {jamTerpilih}</h2>
                  <span className="text-white font-medium text-sm">{teksRute}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handlePrint('rincian')} className="bg-white text-blue-700 px-3 py-1 rounded text-sm font-bold hover:bg-gray-100">🖨️ Cetak Rincian</button>
                  <button onClick={() => setJamTerpilih(null)} className="bg-blue-700 text-white px-3 py-1 rounded text-sm hover:bg-blue-800">&larr; Kembali</button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-200 border-b text-center text-gray-900">
                  <tr>
                    <th className="px-2 py-2 border w-10" rowSpan={2}>No</th>
                    <th className="px-4 py-2 border text-center" rowSpan={2}>Nama / Kursi</th>
                    <th className="px-4 py-2 border" rowSpan={2}>Kode Tiket</th>
                    <th className="px-4 py-2 border" colSpan={3}>Penjualan</th>
                  </tr>
                  <tr>
                    <th className="px-4 py-2 border">Cash</th>
                    <th className="px-4 py-2 border">Qris</th>
                    <th className="px-4 py-2 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dataTerpilih.detail.map((d, idx) => {
                    const isCash = d.metode === 'cash' || d.metode === 'cash_loket';
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 text-center">
                        <td className="px-2 py-3 text-gray-900 font-bold">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-gray-900 text-center">{d.nama_penumpang} / {d.kursi}</td>
                        <td className="px-4 py-3 font-mono text-gray-800">{potongKode(d.kode_tiket)}</td>
                        <td className="px-4 py-3 text-gray-900">{isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-4 py-3 text-gray-900">{!isCash ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">Rp {d.harga.toLocaleString('id-ID')}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-blue-600 text-white font-bold text-center">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 border text-right">TOTAL</td>
                    <td className="px-4 py-3 border">Rp {dataTerpilih.total_cash.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 border">Rp {dataTerpilih.total_qris.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 border">Rp {dataTerpilih.total_pendapatan.toLocaleString('id-ID')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
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
                <th className="border border-gray-400 px-2 py-2" rowSpan={2}>Jam</th>
                <th className="border border-gray-400 px-2 py-2" rowSpan={2}>Total Penumpang</th>
                <th className="border border-gray-400 px-2 py-2" colSpan={3}>Penjualan</th>
              </tr>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1">Cash</th>
                <th className="border border-gray-400 px-2 py-1">Qris</th>
                <th className="border border-gray-400 px-2 py-1">Total</th>
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
                <td className="border border-gray-400 px-2 py-1" colSpan={2}>TOTAL</td>
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
                  <th className="border border-gray-400 px-2 py-2 w-10" rowSpan={2}>No</th>
                  <th className="border border-gray-400 px-2 py-2 text-center" rowSpan={2}>Nama / Kursi</th>
                  <th className="border border-gray-400 px-2 py-2" rowSpan={2}>Kode Tiket</th>
                  <th className="border border-gray-400 px-2 py-2" colSpan={3}>Penjualan</th>
                </tr>
                <tr className="bg-gray-200 text-center text-gray-900">
                  <th className="border border-gray-400 px-2 py-1">Cash</th>
                  <th className="border border-gray-400 px-2 py-1">Qris</th>
                  <th className="border border-gray-400 px-2 py-1">Total</th>
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
    </div>
  )
}