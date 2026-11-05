'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, type Profile } from '@/lib/supabase'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  kode_tiket: string
  harga: number
  metode_bayar: string
}

type LaporanPerJam = {
  jam: string
  total_terjual: number
  total_pendapatan: number
  total_cash: number
  total_qris: number
  rincian: RincianPenumpang[]
}

export default function LaporanKasirPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [tanggal, setTanggal] = useState('')

  const [jamTerpilih, setJamTerpilih] = useState<string | null>(null)
  const [printMode, setPrintMode] = useState<'rekap' | 'rincian'>('rekap')

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      
      if (!currentProfile) {
        const adminProfile = await getProfile()
        if (adminProfile) currentProfile = adminProfile
      }

      if (!currentProfile) {
        router.push('/login')
        return
      }

      const { data: dbProfile, error: dbError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentProfile.id)
        .single()

      if (dbError || !dbProfile) {
        setError('Gagal memvalidasi akun. Silakan login ulang.')
        setLoading(false)
        return
      }

      setProfile(dbProfile as Profile)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0]
    setTanggal(localDate)
  }, [])

  useEffect(() => {
    async function fetchLaporan() {
      if (!profile || !tanggal) return
      
      const { data: pesananData, error: errPesanan } = await supabase
        .from('pesanan')
        .select('id, nama_penumpang, kode_tiket, jadwal_id, kursi_id, kanal, petugas_jual')
        .eq('status', 'paid')

      if (errPesanan) {
        setError('Gagal memuat pesanan: ' + errPesanan.message)
        return
      }

      if (!pesananData || pesananData.length === 0) {
        setLaporan([])
        return
      }

      const pesananIds = pesananData.map((p: any) => p.id)
      const { data: pembayaranData } = await supabase
        .from('pembayaran')
        .select('pesanan_id, metode')
        .in('pesanan_id', pesananIds)

      const metodeMap = new Map()
      pembayaranData?.forEach((p: any) => metodeMap.set(p.pesanan_id, p.metode))

      const jadwalIds = [...new Set(pesananData.map((p: any) => p.jadwal_id))]
      const { data: jadwalData, error: errJadwal } = await supabase
        .from('jadwal')
        .select('id, harga, tanggal, jam_berangkat, rute_asal, rute_tujuan, kapal_id')
        .in('id', jadwalIds)
        .eq('tanggal', tanggal)
        .eq('rute_asal', profile.lokasi)

      if (errJadwal) {
        setError('Gagal memuat jadwal: ' + errJadwal.message)
        return
      }

      const kursiIds = pesananData.map((p: any) => p.kursi_id)
      const { data: kursiData } = await supabase
        .from('kursi')
        .select('id, nomor_kursi')
        .in('id', kursiIds)
      
      const kursiMap = new Map(kursiData?.map(k => [k.id, k.nomor_kursi]) || [])
      const jadwalMap = new Map(jadwalData?.map(j => [j.id, j]) || [])

      const filteredData = pesananData.filter((p: any) => jadwalMap.has(p.jadwal_id))
      
      const groupedByJam: { [key: string]: LaporanPerJam } = {}

      filteredData.forEach((item: any) => {
        const jadwal = jadwalMap.get(item.jadwal_id)
        if (!jadwal) return

        const jam = jadwal.jam_berangkat.substring(0, 5)
        
        if (!groupedByJam[jam]) {
          groupedByJam[jam] = {
            jam: jam,
            total_terjual: 0,
            total_pendapatan: 0,
            total_cash: 0,
            total_qris: 0,
            rincian: []
          }
        }

        const group = groupedByJam[jam]
        group.total_terjual += 1
        group.total_pendapatan += jadwal.harga || 0

        const metode = metodeMap.get(item.id) || '-'
        const labelMetode = metode === 'cash_loket' ? 'Cash' : (metode === 'simulasi_online' ? 'QRIS' : metode)

        if (labelMetode === 'Cash') {
          group.total_cash += jadwal.harga || 0
        } else if (labelMetode === 'QRIS') {
          group.total_qris += jadwal.harga || 0
        }

        group.rincian.push({
          id: item.id,
          nama: item.nama_penumpang,
          kursi: kursiMap.get(item.kursi_id) || '-',
          kode_tiket: item.kode_tiket,
          harga: jadwal.harga || 0,
          metode_bayar: labelMetode
        })
      })

      const laporanArray = Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam))
      setLaporan(laporanArray)
    }

    fetchLaporan()
  }, [profile, tanggal])

  const handlePrint = (mode: 'rekap' | 'rincian') => {
    setPrintMode(mode)
    setTimeout(() => {
      window.print()
    }, 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center items-center">
      <div className="bg-white p-8 rounded shadow max-w-md text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
        <p className="text-gray-700 mb-6">{error}</p>
        <button onClick={() => router.push('/login')} className="bg-blue-600 text-white px-4 py-2 rounded">Login Ulang</button>
      </div>
    </div>
  )
  if (!profile) return null

  let labelRole = 'Operator'
  if (profile.role === 'petugas_loket') labelRole = 'Operator Loket'
  if (profile.role === 'petugas_mobile') labelRole = 'Operator Mobile'
  if (profile.role === 'terminal_keberangkatan') labelRole = 'Operator Keberangkatan'
  if (profile.role === 'admin_utama') labelRole = 'Admin Utama'

  const grandTotal = laporan.reduce(
    (acc, curr) => ({
      penumpang: acc.penumpang + curr.total_terjual,
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

  // Tentukan teks rute untuk print
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
            <p className="text-sm text-gray-600">{profile.nama}</p>
          </div>
          <button onClick={() => {
            if (profile.role === 'terminal_keberangkatan') router.push('/dashboard/keberangkatan')
            else router.push('/dashboard/loket-menu')
          }} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali ke Menu
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
              {laporan.length === 0 ? (
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
                        <th className="px-4 py-3 border" rowSpan={2}>Jam</th>
                        <th className="px-4 py-3 border" rowSpan={2}>Total Penumpang</th>
                        <th className="px-4 py-3 border" colSpan={3}>Penjualan</th>
                        <th className="px-4 py-3 border" rowSpan={2}>Aksi</th>
                      </tr>
                      <tr>
                        <th className="px-4 py-3 border">Cash</th>
                        <th className="px-4 py-3 border">Qris</th>
                        <th className="px-4 py-3 border">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laporan.map((l) => (
                        <tr key={l.jam} className="border-b last:border-0 hover:bg-gray-50 text-center">
                          <td className="px-4 py-3 font-bold text-gray-900">{l.jam}</td>
                          <td className="px-4 py-3 text-blue-600 font-bold">{l.total_terjual}</td>
                          <td className="px-4 py-3 text-gray-900">Rp {l.total_cash.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3 text-gray-900">Rp {l.total_qris.toLocaleString('id-ID')}</td>
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
                    <th className="px-2 py-3 border w-10" rowSpan={2}>No</th>
                    <th className="px-4 py-3 border text-center" rowSpan={2}>Nama / Kursi</th>
                    <th className="px-4 py-3 border" rowSpan={2}>Kode Tiket</th>
                    <th className="px-4 py-3 border" colSpan={3}>Penjualan</th>
                  </tr>
                  <tr>
                    <th className="px-4 py-3 border">Cash</th>
                    <th className="px-4 py-3 border">Qris</th>
                    <th className="px-4 py-3 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dataTerpilih.rincian.map((d, idx) => {
                    const isCash = d.metode_bayar === 'Cash';
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 text-center">
                        <td className="px-2 py-3 text-gray-900 font-bold">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-gray-900 text-center">{d.nama} / {d.kursi}</td>
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
        
        <div className="hidden print-rekap-only">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">Rekapan Laporan Penjualan {teksRute}</h1>
            <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1">
              <span>Petugas</span><span>:</span><span>{profile.nama}</span>
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
                  <td className="border border-gray-400 px-2 py-1">{l.total_terjual}</td>
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

        {dataTerpilih && (
          <div className="hidden print-rincian-only">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-gray-900">Rincian Laporan Penjualan {teksRute}</h1>
              <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1">
                <span>Petugas</span><span>:</span><span>{profile.nama}</span>
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
                {dataTerpilih.rincian.map((d, idx) => {
                  const isCash = d.metode_bayar === 'Cash';
                  return (
                    <tr key={d.id} className="text-center text-gray-900">
                      <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center font-bold">{d.nama} / {d.kursi}</td>
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