'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, type Profile } from '@/lib/supabase'

type LaporanBulanan = {
  bulan: string
  total_tiket: number
  fee_per_tiket: number
  total_fee: number
}

type LaporanHarian = {
  tanggal: string
  total_tiket: number
  fee_per_tiket: number
  total_fee: number
}

type RincianPerJam = {
  jam: string
  rute: string
  total_tiket: number
  fee_per_tiket: number
  total_fee: number
}

function RekapBagiHasilContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [laporanBulanan, setLaporanBulanan] = useState<LaporanBulanan[]>([])
  const [bulanDipilih, setBulanDipilih] = useState<string | null>(null)
  const [laporanHarian, setLaporanHarian] = useState<LaporanHarian[]>([])
  const [tanggalDipilih, setTanggalDipilih] = useState<string | null>(null)
  const [rincianAktif, setRincianAktif] = useState<RincianPerJam[]>([])

  const [printMode, setPrintMode] = useState<'harian' | 'jam' | 'semua'>('semua')

  const FEE_PER_TIKET = 3000

  // FUNGSI WAKTU LOKAL WITA (UTC+8)
  const getWaktuWITA = () => {
    const now = new Date();
    const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return witaTime;
  }

  const getBatasTanggal = () => {
    const wita = getWaktuWITA();
    if (wita.getUTCHours() >= 16) {
      return wita.toISOString().split('T')[0];
    } else {
      wita.setUTCDate(wita.getUTCDate() - 1);
      return wita.toISOString().split('T')[0];
    }
  }

  useEffect(() => {
    async function init() {
      const adminProfile = await getProfile()
      if (!adminProfile || adminProfile.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(adminProfile)
      await fetchLaporanBulanan()
      setLoading(false)
    }
    init()
  }, [router])

  async function fetchLaporanBulanan() {
    const { data: pesananData, error: errPesanan } = await supabase
      .from('pesanan')
      .select('id, jadwal:jadwal_id(tanggal)')
      .eq('status', 'paid')

    if (errPesanan) {
      setError('Gagal memuat data: ' + errPesanan.message)
      return
    }

    const batasTanggal = getBatasTanggal()
    const groupedByMonth: { [key: string]: LaporanBulanan } = {}

    if (pesananData) {
      pesananData.forEach((p: any) => {
        if (!p.jadwal || !p.jadwal.tanggal) return
        const tgl = p.jadwal.tanggal
        
        if (tgl > batasTanggal) return

        const bulan = tgl.substring(0, 7)

        if (!groupedByMonth[bulan]) {
          groupedByMonth[bulan] = { bulan, total_tiket: 0, fee_per_tiket: FEE_PER_TIKET, total_fee: 0 }
        }

        groupedByMonth[bulan].total_tiket += 1
        groupedByMonth[bulan].total_fee += FEE_PER_TIKET
      })
    }

    const laporanArray = Object.values(groupedByMonth).sort((a, b) => b.bulan.localeCompare(a.bulan))
    setLaporanBulanan(laporanArray)
  }

  async function handleLihatBulan(bulan: string) {
    setBulanDipilih(bulan)
    setTanggalDipilih(null)

    const { data: pesananData } = await supabase
      .from('pesanan')
      .select('id, jadwal:jadwal_id(tanggal)')
      .eq('status', 'paid')

    const groupedByDate: { [key: string]: LaporanHarian } = {}
    const batasTanggal = getBatasTanggal()

    const [tahun, bln] = bulan.split('-').map(Number)
    const lastDay = new Date(tahun, bln, 0).getDate()
    
    for (let i = 1; i <= lastDay; i++) {
      const tglStr = `${bulan}-${String(i).padStart(2, '0')}`
      if (tglStr <= batasTanggal) {
        groupedByDate[tglStr] = { tanggal: tglStr, total_tiket: 0, fee_per_tiket: FEE_PER_TIKET, total_fee: 0 }
      }
    }

    if (pesananData) {
      pesananData.forEach((p: any) => {
        if (!p.jadwal || !p.jadwal.tanggal) return
        const tgl = p.jadwal.tanggal

        if (tgl.startsWith(bulan) && groupedByDate[tgl]) {
          groupedByDate[tgl].total_tiket += 1
          groupedByDate[tgl].total_fee += FEE_PER_TIKET
        }
      })
    }

    const laporanArray = Object.values(groupedByDate).sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    setLaporanHarian(laporanArray)
  }

  async function handleLihatTanggal(tanggal: string) {
    setTanggalDipilih(tanggal)
    
    const { data: templateData } = await supabase
      .from('template_jadwal')
      .select('jam_berangkat, rute_asal, rute_tujuan')
      .eq('aktif', true)

    const { data: pesananData } = await supabase
      .from('pesanan')
      .select('id, jadwal:jadwal_id(jam_berangkat, tanggal, rute_asal, rute_tujuan)')
      .eq('status', 'paid')

    const grouped: { [key: string]: RincianPerJam } = {}

    if (templateData) {
      templateData.forEach((t: any) => {
        const jam = t.jam_berangkat.substring(0, 5)
        const rute = `${t.rute_asal} - ${t.rute_tujuan}`
        const key = `${jam}|${rute}`
        
        if (!grouped[key]) {
          grouped[key] = { jam, rute, total_tiket: 0, fee_per_tiket: FEE_PER_TIKET, total_fee: 0 }
        }
      })
    }

    if (pesananData) {
      pesananData.forEach((p: any) => {
        if (!p.jadwal || p.jadwal.tanggal !== tanggal) return
        
        const jam = p.jadwal.jam_berangkat.substring(0, 5)
        const rute = `${p.jadwal.rute_asal} - ${p.jadwal.rute_tujuan}`
        const key = `${jam}|${rute}`

        if (!grouped[key]) {
          grouped[key] = { jam, rute, total_tiket: 0, fee_per_tiket: FEE_PER_TIKET, total_fee: 0 }
        }
        
        grouped[key].total_tiket += 1
        grouped[key].total_fee += FEE_PER_TIKET
      })
    }

    const rincianArray = Object.values(grouped).sort((a, b) => {
      if (a.jam !== b.jam) return a.jam.localeCompare(b.jam)
      return a.rute.localeCompare(b.rute)
    })
    
    setRincianAktif(rincianArray)
  }

  const handlePrintHarian = () => {
    setPrintMode('harian')
    setTimeout(() => window.print(), 100)
  }

  const handlePrintJam = () => {
    setPrintMode('jam')
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>
  if (!profile) return null

  const totalTiketHarian = laporanHarian.reduce((sum, item) => sum + item.total_tiket, 0)
  const totalFeeHarian = laporanHarian.reduce((sum, item) => sum + item.total_fee, 0)

  const totalTiketJam = rincianAktif.reduce((sum, item) => sum + item.total_tiket, 0)
  const totalFeeJam = rincianAktif.reduce((sum, item) => sum + item.total_fee, 0)

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; margin: 15mm; }
          .print-hidden { display: none !important; }
          .print-harian-only { display: ${printMode === 'harian' ? 'block' : 'none'} !important; }
          .print-jam-only { display: ${printMode === 'jam' ? 'block' : 'none'} !important; }
          .print-semua { display: ${printMode === 'semua' ? 'block' : 'none'} !important; }
          table { font-size: 11px !important; }
          th, td { padding: 2px 4px !important; }
        }
      `}} />

      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rekap Fee Platform</h1>
            <p className="text-sm text-gray-600">Laporan pendapatan fee sistem</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        {/* TINGKAT 1: TABEL BULANAN */}
        <div className="bg-white p-8 rounded shadow print:shadow-none print:p-0 mb-8 print-semua">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-900">REKAPAN FEE PLATFORM (BULANAN)</h2>

          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-blue-100 text-gray-900">
                <th className="border border-gray-400 px-3 py-2 font-bold text-center">BULAN</th>
                <th className="border border-gray-400 px-3 py-2 font-bold text-center">TOTAL TIKET</th>
                <th className="border border-gray-400 px-3 py-2 font-bold text-center">FEE</th>
                <th className="border border-gray-400 px-3 py-2 font-bold text-center">TOTAL FEE</th>
                <th className="border border-gray-400 px-3 py-2 font-bold text-center w-24 print-hidden">AKSI</th>
              </tr>
            </thead>
            <tbody>
              {laporanBulanan.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-gray-400 px-3 py-4 text-center text-gray-500">Belum ada data penjualan.</td>
                </tr>
              ) : (
                laporanBulanan.map((l) => (
                  <tr key={l.bulan} className="text-gray-800 hover:bg-gray-50">
                    <td className="border border-gray-400 px-3 py-2 text-center font-bold">{l.bulan}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.total_tiket} Tiket</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">Rp {l.fee_per_tiket.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-3 py-2 text-right font-bold text-blue-700">Rp {l.total_fee.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center print-hidden">
                      <button 
                        onClick={() => handleLihatBulan(l.bulan)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 font-bold"
                      >
                        📋 Perincian
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* TINGKAT 2: TABEL HARIAN */}
        {bulanDipilih && (
          <div className={`bg-white p-8 rounded shadow print:shadow-none print:p-0 mb-8 ${printMode === 'harian' ? 'print-harian-only' : 'print-semua'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Rincian Harian Fee Platform</h2>
              <div className="flex gap-2 print-hidden">
                <button 
                  onClick={handlePrintHarian} 
                  className="bg-gray-800 text-white px-3 py-1 rounded text-xs hover:bg-gray-700 flex items-center gap-1"
                >
                  🖨️ Cetak Harian
                </button>
                <button 
                  onClick={() => { setBulanDipilih(null); setTanggalDipilih(null); }}
                  className="text-red-600 text-xs hover:underline"
                >
                  ✖ Tutup
                </button>
              </div>
            </div>
            
            <div className="mb-6 text-sm grid grid-cols-[80px_10px_1fr] gap-y-1 text-gray-800">
              <span>Bulan</span><span>:</span><span className="font-bold">{bulanDipilih}</span>
            </div>

            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-100 text-gray-900">
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">TANGGAL</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">TIKET</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">FEE</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">TOTAL FEE</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center w-24 print-hidden">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {laporanHarian.map((l) => (
                  <tr key={l.tanggal} className="text-gray-800">
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.tanggal}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.total_tiket}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">Rp {l.fee_per_tiket.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-3 py-2 text-right">Rp {l.total_fee.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center print-hidden">
                      <button 
                        onClick={() => handleLihatTanggal(l.tanggal)}
                        className="bg-green-600 text-white px-2 py-1 rounded text-[10px] hover:bg-green-700 font-bold"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-200 text-gray-900">
                  <td colSpan={1} className="border border-gray-400 px-3 py-2 text-center">TOTAL BULAN INI</td>
                  <td className="border border-gray-400 px-3 py-2 text-center">{totalTiketHarian}</td>
                  <td className="border border-gray-400 px-3 py-2 text-center"></td>
                  <td className="border border-gray-400 px-3 py-2 text-right">Rp {totalFeeHarian.toLocaleString('id-ID')}</td>
                  <td className="border border-gray-400 px-3 py-2 text-center print-hidden"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* TINGKAT 3: TABEL RINCIAN JAM & RUTE */}
        {tanggalDipilih && (
          <div className={`bg-white p-8 rounded shadow print:shadow-none print:p-0 ${printMode === 'jam' ? 'print-jam-only' : 'print-semua'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Rincian Jam & Rute Fee Platform</h2>
              <div className="flex gap-2 print-hidden">
                <button 
                  onClick={handlePrintJam} 
                  className="bg-gray-800 text-white px-3 py-1 rounded text-xs hover:bg-gray-700 flex items-center gap-1"
                >
                  🖨️ Cetak Detail
                </button>
                <button 
                  onClick={() => setTanggalDipilih(null)}
                  className="text-red-600 text-xs hover:underline"
                >
                  ✖ Tutup
                </button>
              </div>
            </div>
            
            <div className="mb-6 text-sm grid grid-cols-[80px_10px_1fr] gap-y-1 text-gray-800">
              <span>Tanggal</span><span>:</span><span className="font-bold">{tanggalDipilih}</span>
            </div>

            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-100 text-gray-900">
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center w-16">JAM</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">RUTE</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">TIKET</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">FEE</th>
                  <th className="border border-gray-400 px-3 py-2 font-bold text-center">TOTAL FEE</th>
                </tr>
              </thead>
              <tbody>
                {rincianAktif.map((l) => (
                  <tr key={`${l.jam}-${l.rute}`} className="text-gray-800">
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.jam}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.rute}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">{l.total_tiket}</td>
                    <td className="border border-gray-400 px-3 py-2 text-center">Rp {l.fee_per_tiket.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-3 py-2 text-right">Rp {l.total_fee.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-200 text-gray-900">
                  <td colSpan={2} className="border border-gray-400 px-3 py-2 text-center">TOTAL HARI INI</td>
                  <td className="border border-gray-400 px-3 py-2 text-center">{totalTiketJam}</td>
                  <td className="border border-gray-400 px-3 py-2 text-center"></td>
                  <td className="border border-gray-400 px-3 py-2 text-right">Rp {totalFeeJam.toLocaleString('id-ID')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}

export default function RekapBagiHasilPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <RekapBagiHasilContent />
    </Suspense>
  )
}