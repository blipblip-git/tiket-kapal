'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type RincianPenumpang = {
  id: string
  nama: string
  kursi: string
  kanal: string
  kode_tiket: string
  harga: number
  tanggal: string
  rute: string
  nama_kapal: string
  nama_kapten: string
  status_boarding: string
  waktu_boarding: string | null
  petugas_jual: string | null
  nama_petugas: string
  metode_bayar: string
  is_balita: boolean
}

type LaporanPerJam = {
  jam: string
  total_terjual: number
  total_pendapatan: number
  total_cash: number
  total_qris: number
  rincian: RincianPenumpang[]
  nama_kapal: string
  status_jadwal: string
}

function LaporanContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view')
  const lokasiParam = searchParams.get('lokasi')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [laporan, setLaporan] = useState<LaporanPerJam[]>([])
  const [tanggal, setTanggal] = useState('')

  const [selectedJam, setSelectedJam] = useState<string | null>(null)
  const [selectedPetugas, setSelectedPetugas] = useState<string | null>(null)

  const [expandedJam, setExpandedJam] = useState<string | null>(null)
  const [printMode, setPrintMode] = useState<'rekap-harian' | 'rekap-petugas' | 'rincian-penumpang' | 'rekap-boarding' | 'rincian-boarding' | 'manifest'>('rekap-harian')

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) {
        const adminProfile = await getProfile()
        if (adminProfile) currentProfile = adminProfile
      }
      if (!currentProfile) { router.push('/login'); return }
      setProfile(currentProfile)
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
      if (!profile || !view || !tanggal) return
      
      const isAdmin = profile.role === 'admin_utama'
      const lokasiTarget = isAdmin ? (lokasiParam || profile.lokasi) : profile.lokasi

      const { data: templateData } = await supabase
        .from('template_jadwal')
        .select('jam_berangkat')
        .eq('rute_asal', lokasiTarget)
      
      let query = supabase
        .from('pesanan')
        .select(`
          id, nama_penumpang, kode_tiket, kanal, status, status_boarding, waktu_boarding, petugas_jual, is_balita,
          jadwal:jadwal_id (rute_asal, rute_tujuan, harga, tanggal, jam_berangkat, status_jadwal, kapal_id),
          kursi:kursi_id (nomor_kursi)
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', tanggal)

      if (!isAdmin) {
        query = query.eq('jadwal.rute_asal', lokasiTarget)
      } else if (lokasiParam) {
        query = query.eq('jadwal.rute_asal', lokasiParam)
      }

      if (profile.role === 'agen' || profile.role === 'terminal_keberangkatan') {
        query = query.eq('petugas_jual', profile.email)
      }

      const { data, error } = await query
      if (error) { setError('Gagal memuat laporan: ' + error.message); return }

      if (data) {
        const filtered = data.filter((item: any) => {
          if (!item.jadwal) return false;
          if (isAdmin) {
            if (lokasiParam) return item.jadwal.rute_asal === lokasiParam;
            return true;
          }
          return item.jadwal.rute_asal === lokasiTarget;
        })

        const pesananIds = filtered.map((p: any) => p.id)
        const { data: pembayaranData } = await supabase
          .from('pembayaran')
          .select('pesanan_id, metode')
          .in('pesanan_id', pesananIds)

        const metodeMap = new Map()
        pembayaranData?.forEach((p: any) => metodeMap.set(p.pesanan_id, p.metode))

        const emails = [...new Set(filtered.map((item: any) => item.petugas_jual).filter(Boolean))]
        const petugasMap = new Map()
        if (emails.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles').select('email, nama').in('email', emails)
          profilesData?.forEach((p: any) => petugasMap.set(p.email, p.nama))
        }

        const jamSet = new Set<string>()
        if (templateData) {
          templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))
        }
        
        const groupedByJam: { [key: string]: LaporanPerJam } = {}

        jamSet.forEach(jam => {
          groupedByJam[jam] = {
            jam: jam,
            total_terjual: 0,
            total_pendapatan: 0,
            total_cash: 0,
            total_qris: 0,
            rincian: [],
            nama_kapal: '-',
            status_jadwal: 'open'
          }
        })

        const kapalMap = new Map()
        const kapalIds = [...new Set(filtered.map((item: any) => item.jadwal?.kapal_id).filter(Boolean))]
        if (kapalIds.length > 0) {
          const { data: kapalData } = await supabase.from('kapal').select('id, nama, nama_kapten').in('id', kapalIds)
          kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
        }

        filtered.forEach((item: any) => {
          const jam = item.jadwal.jam_berangkat.substring(0, 5)
          
          if (!groupedByJam[jam]) {
            groupedByJam[jam] = {
              jam: jam,
              total_terjual: 0,
              total_pendapatan: 0,
              total_cash: 0,
              total_qris: 0,
              rincian: [],
              nama_kapal: '-',
              status_jadwal: item.jadwal.status_jadwal
            }
          }

          const group = groupedByJam[jam]
          
          if (!item.is_balita) {
            group.total_terjual += 1
          }

          const hargaAktual = item.is_balita ? 0 : (item.jadwal.harga || 0)
          group.total_pendapatan += hargaAktual
          
          const metode = metodeMap.get(item.id) || '-'
          const labelMetode = metode === 'cash_loket' ? 'Cash' : (metode === 'simulasi_online' ? 'QRIS' : metode)

          if (labelMetode === 'Cash') group.total_cash += hargaAktual
          else if (labelMetode === 'QRIS') group.total_qris += hargaAktual

          const dataKapal = kapalMap.get(item.jadwal.kapal_id)
          const namaPetugas = item.petugas_jual ? (petugasMap.get(item.petugas_jual) || item.petugas_jual.split('@')[0]) : 'ONLINE'

          group.rincian.push({
            id: item.id,
            nama: item.nama_penumpang,
            kursi: item.kursi?.nomor_kursi || '-',
            kanal: item.kanal || 'loket',
            kode_tiket: item.kode_tiket,
            harga: hargaAktual,
            tanggal: item.jadwal.tanggal,
            rute: `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`,
            nama_kapal: dataKapal?.nama || '-',
            nama_kapten: dataKapal?.nama_kapten || '-',
            status_boarding: item.status_boarding || 'belum',
            waktu_boarding: item.waktu_boarding || null,
            petugas_jual: item.petugas_jual || null,
            nama_petugas: namaPetugas,
            metode_bayar: labelMetode,
            is_balita: item.is_balita || false
          })

          if (item.jadwal.status_jadwal === 'berangkat') {
            group.status_jadwal = 'berangkat'
          }
          if (dataKapal) {
            group.nama_kapal = dataKapal.nama
          }
        })

        const laporanArray = Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam))
        setLaporan(laporanArray)
      }
    }

    fetchLaporan()
  }, [profile, tanggal, view, lokasiParam])

  useEffect(() => {
    setSelectedJam(null)
    setSelectedPetugas(null)
  }, [tanggal])

  const handlePrint = (mode: 'rekap-harian' | 'rekap-petugas' | 'rincian-penumpang' | 'rekap-boarding' | 'rincian-boarding' | 'manifest') => {
    setPrintMode(mode)
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>
  if (!profile) return null

  const ruteLengkap = `${lokasiParam || profile.lokasi} - ${lokasiParam === 'Tarakan' ? 'Tanjung Selor' : (lokasiParam === 'Tanjung Selor' ? 'Tarakan' : (profile.lokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'))}`

  const now = new Date()
  const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  const laporanBelumClosed = laporan.filter(l => tanggal === hariIniStr && l.jam > jamSekarang)
  const laporanSudahClosed = laporan.filter(l => tanggal !== hariIniStr || l.jam <= jamSekarang)
  
  const rincianAktif = expandedJam ? laporan.find(l => l.jam === expandedJam) : null

  const potongKode = (kode: string) => kode ? (kode.length > 6 ? kode.slice(-6) : kode) : '-'

  const getRekapPetugas = (jam: string) => {
    const dataJam = laporan.find(l => l.jam === jam)
    if (!dataJam) return []
    const petugasMap: { [key: string]: { nama: string, total: number, cash: number, qris: number, jumlah: number } } = {}
    dataJam.rincian.forEach(p => {
      if (!petugasMap[p.nama_petugas]) petugasMap[p.nama_petugas] = { nama: p.nama_petugas, total: 0, cash: 0, qris: 0, jumlah: 0 }
      const pt = petugasMap[p.nama_petugas]
      
      if (!p.is_balita) pt.jumlah += 1
      
      pt.total += p.harga
      if (p.metode_bayar === 'Cash') pt.cash += p.harga
      else if (p.metode_bayar === 'QRIS') pt.qris += p.harga
    })
    return Object.values(petugasMap).sort((a, b) => b.total - a.total)
  }

  const getRincianPenumpang = (jam: string, petugas: string) => {
    const dataJam = laporan.find(l => l.jam === jam)
    return dataJam ? dataJam.rincian.filter(p => p.nama_petugas === petugas) : []
  }

  const totalPenjualanHarian = laporan.reduce((sum, item) => sum + item.total_pendapatan, 0)
  const totalCashHarian = laporan.reduce((sum, item) => sum + item.total_cash, 0)
  const totalQrisHarian = laporan.reduce((sum, item) => sum + item.total_qris, 0)
  const totalPenumpang = laporan.reduce((sum, item) => sum + item.total_terjual, 0)
  const totalBoarding = laporan.reduce((sum, item) => sum + item.rincian.filter(p => p.status_boarding === 'sudah').length, 0)

  const isOperator = profile.role === 'terminal_keberangkatan' || profile.role === 'agen'
  
  const tanggalFormatHeader = new Date(tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  const dataRincianAktif = selectedJam && selectedPetugas ? getRincianPenumpang(selectedJam, selectedPetugas) : []
  const jmlDewasa = dataRincianAktif.filter(p => !p.is_balita).length
  const jmlBalita = dataRincianAktif.filter(p => p.is_balita).length

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { 
            size: A4; 
            margin: 15mm; 
          }
          body { 
            background: white; 
            margin: 0; 
          }
          .print-hidden { display: none !important; }
          .print-rekap-harian { display: ${printMode === 'rekap-harian' ? 'block' : 'none'} !important; }
          .print-rekap-petugas { display: ${printMode === 'rekap-petugas' ? 'block' : 'none'} !important; }
          .print-rincian-penumpang { display: ${printMode === 'rincian-penumpang' ? 'block' : 'none'} !important; }
          .print-rekap-boarding { display: ${printMode === 'rekap-boarding' ? 'block' : 'none'} !important; }
          .print-rincian-boarding { display: ${printMode === 'rincian-boarding' ? 'block' : 'none'} !important; }
          .print-manifest { display: ${printMode === 'manifest' ? 'block' : 'none'} !important; }
          
          html, body {
            height: auto !important;
            overflow: hidden !important;
          }
          .no-print { display: none !important; }
          
          table { font-size: 9px !important; }
          th, td { padding: 2px 4px !important; }
          tr { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          h1 { font-size: 14px !important; margin-bottom: 8px !important; }
          .print-info { font-size: 9px !important; margin-bottom: 8px !important; }
        }
      `}} />

      <div className="max-w-6xl w-full mx-auto flex flex-col h-full">
        
        <div className="flex justify-between items-start mb-4 bg-white p-3 md:p-4 rounded shadow-sm border border-gray-200 print-hidden flex-shrink-0">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-gray-900">Laporan Rekapan</h1>
            <p className="text-xs md:text-sm font-bold text-blue-600 mt-0.5">{tanggalFormatHeader}</p>
          </div>
          <button onClick={() => router.push('/laporan-penjualan-admin')} className="text-[10px] md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition">
            &larr; Kembali
          </button>
        </div>

        {!selectedJam && (
          <div className="bg-white p-3 rounded shadow mb-4 flex items-center gap-4 print-hidden flex-shrink-0">
            <label className="text-xs md:text-sm font-medium text-gray-700">Ganti Tanggal:</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900" />
          </div>
        )}

        <div className="print-hidden flex-1 flex flex-col min-h-0">
          {view === 'penjualan' && (
            <>
              {/* LEVEL 1: REKAP HARIAN */}
              {!selectedJam && (
                <div className="bg-white rounded shadow border border-gray-200 overflow-hidden mb-6 flex flex-col flex-1 min-h-0">
                  <div className="bg-blue-600 px-3 md:px-4 py-2 md:py-3 border-b flex justify-between items-center flex-shrink-0">
                    <h2 className="text-white font-bold text-xs md:text-base">Laporan Rekapan Harian</h2>
                    <button onClick={() => handlePrint('rekap-harian')} className="bg-white text-blue-700 px-2 md:px-3 py-1 rounded text-[10px] md:text-sm font-bold hover:bg-gray-100">🖨️ Cetak</button>
                  </div>
                  
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full table-fixed border-collapse text-gray-900">
                      <thead>
                        <tr className="bg-gray-200 border-b">
                          <th className="border p-1 text-[9px] md:text-xs w-[6%]" rowSpan={2}>No</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[24%] text-center" rowSpan={2}>Jam / Kapal</th>
                          <th className="border p-1 text-[9px] md:text-xs" colSpan={4}>Total</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[12%]" rowSpan={2}>Aksi</th>
                        </tr>
                        <tr className="bg-gray-200 border-b">
                          <th className="border p-1 text-[9px] md:text-xs w-[10%] whitespace-nowrap">Kursi</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Cash</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Qris</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Jual</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {[...laporanBelumClosed, ...laporanSudahClosed].sort((a,b)=>a.jam.localeCompare(b.jam)).map((l, idx) => (
                          <tr key={l.jam} className="hover:bg-gray-50 text-center">
                            <td className="border p-1 text-[9px] md:text-xs">{idx + 1}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold text-left leading-tight">
                              {isOperator ? l.jam : (
                                <>
                                  <div>{l.jam}</div>
                                  <div className="text-[8px] md:text-[10px] font-normal">{l.nama_kapal}</div>
                                </>
                              )}
                            </td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold text-blue-600 whitespace-nowrap">{l.total_terjual}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-medium">Rp {l.total_cash.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-medium">Rp {l.total_qris.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold">Rp {l.total_pendapatan.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-center">
                              <button onClick={() => setSelectedJam(l.jam)} className="bg-blue-100 text-blue-700 px-1 py-0.5 rounded text-[9px] md:text-xs font-bold hover:bg-blue-200">Rincian</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-600 text-white font-bold text-center">
                        <tr>
                          <td colSpan={2} className="p-1 border text-[9px] md:text-xs">TOTAL</td>
                          <td className="p-1 border text-[9px] md:text-xs whitespace-nowrap">{totalPenumpang}</td>
                          <td className="p-1 border text-[9px] md:text-xs">Rp {totalCashHarian.toLocaleString('id-ID')}</td>
                          <td className="p-1 border text-[9px] md:text-xs">Rp {totalQrisHarian.toLocaleString('id-ID')}</td>
                          <td className="p-1 border text-[9px] md:text-xs">Rp {totalPenjualanHarian.toLocaleString('id-ID')}</td>
                          <td className="p-1 border"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* LEVEL 2: REKAP PETUGAS */}
              {selectedJam && !selectedPetugas && (
                <div className="bg-white rounded shadow border border-gray-200 overflow-hidden mb-6">
                  <div className="bg-blue-600 px-3 md:px-4 py-2 md:py-3 border-b flex justify-between items-center flex-wrap gap-2">
                    <h2 className="text-white font-bold text-xs md:text-base">Rekap Petugas Jam {selectedJam}</h2>
                    <div className="flex gap-2">
                      <button onClick={() => handlePrint('rekap-petugas')} className="bg-white text-blue-700 px-2 md:px-3 py-1 rounded text-[10px] md:text-sm font-bold hover:bg-gray-100">🖨️ Cetak</button>
                      <button onClick={() => setSelectedJam(null)} className="bg-blue-700 text-white px-2 md:px-3 py-1 rounded text-[10px] md:text-sm hover:bg-blue-800">&larr; Kembali</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-gray-900">
                      <thead>
                        <tr className="bg-gray-200 border-b">
                          <th className="border p-1 text-[9px] md:text-xs w-[6%]" rowSpan={2}>No</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[24%] text-center uppercase" rowSpan={2}>Petugas</th>
                          <th className="border p-1 text-[9px] md:text-xs" colSpan={4}>Total</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[12%]" rowSpan={2}>Aksi</th>
                        </tr>
                        <tr className="bg-gray-200 border-b">
                          <th className="border p-1 text-[9px] md:text-xs w-[10%] whitespace-nowrap">Kursi</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Cash</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Qris</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[16%]">Jual</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getRekapPetugas(selectedJam).map((pt, idx) => (
                          <tr key={pt.nama} className="hover:bg-gray-50 text-center">
                            <td className="border p-1 text-[9px] md:text-xs">{idx + 1}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold text-left leading-tight">{pt.nama}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold text-blue-600 whitespace-nowrap">{pt.jumlah}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-medium">Rp {pt.cash.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-medium">Rp {pt.qris.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-[9px] md:text-xs font-bold">Rp {pt.total.toLocaleString('id-ID')}</td>
                            <td className="border p-1 text-center">
                              <button onClick={() => setSelectedPetugas(pt.nama)} className="bg-green-100 text-green-700 px-1 py-0.5 rounded text-[9px] md:text-xs font-bold hover:bg-green-200">Rincian</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-600 text-white font-bold text-center">
                        {(() => {
                          const dataPt = getRekapPetugas(selectedJam);
                          const tJumlah = dataPt.reduce((s, x) => s + x.jumlah, 0);
                          const tCash = dataPt.reduce((s, x) => s + x.cash, 0);
                          const tQris = dataPt.reduce((s, x) => s + x.qris, 0);
                          const tTotal = dataPt.reduce((s, x) => s + x.total, 0);
                          return (
                            <tr>
                              <td colSpan={2} className="p-1 border text-[9px] md:text-xs">TOTAL</td>
                              <td className="p-1 border text-[9px] md:text-xs whitespace-nowrap">{tJumlah}</td>
                              <td className="p-1 border text-[9px] md:text-xs">Rp {tCash.toLocaleString('id-ID')}</td>
                              <td className="p-1 border text-[9px] md:text-xs">Rp {tQris.toLocaleString('id-ID')}</td>
                              <td className="p-1 border text-[9px] md:text-xs">Rp {tTotal.toLocaleString('id-ID')}</td>
                              <td className="p-1 border"></td>
                            </tr>
                          )
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* LEVEL 3: RINCIAN PENUMPANG */}
              {selectedJam && selectedPetugas && (
                <div className="bg-white rounded shadow border border-gray-200 overflow-hidden mb-6 flex flex-col flex-1 min-h-0">
                  
                  <div className="bg-blue-600 px-3 md:px-4 py-2 md:py-3 border-b flex justify-between items-center flex-wrap gap-2 flex-shrink-0">
                    <div>
                      <h2 className="text-white font-bold text-xs md:text-base truncate">Rincian {selectedPetugas} - Jam {selectedJam}</h2>
                      <div className="text-[10px] md:text-xs text-blue-100 font-medium mt-0.5 flex flex-col">
                        <span>Total Penumpang : {dataRincianAktif.length} Orang</span>
                        <span className="pl-[105px]">Dewasa {jmlDewasa} Orang</span>
                        <span className="pl-[105px]">Balita {jmlBalita} Orang</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handlePrint('rincian-penumpang')} className="bg-white text-blue-700 px-2 md:px-3 py-1 rounded text-[10px] md:text-sm font-bold hover:bg-gray-100">🖨️ Cetak</button>
                      <button onClick={() => setSelectedPetugas(null)} className="bg-blue-700 text-white px-2 md:px-3 py-1 rounded text-[10px] md:text-sm hover:bg-blue-800">&larr; Kembali</button>
                    </div>
                  </div>
                  
                  <div className="overflow-y-auto flex-1">
                    <table className="w-full table-fixed border-collapse text-gray-900">
                      <thead className="bg-gray-200 border-b sticky top-0 z-10">
                        <tr>
                          <th className="border p-1 text-[9px] md:text-xs w-[5%]" rowSpan={2}>No</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[35%] text-left" rowSpan={2}>Nama / Kursi</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[15%]" rowSpan={2}>Kode</th>
                          <th className="border p-1 text-[9px] md:text-xs" colSpan={3}>Penjualan</th>
                        </tr>
                        <tr>
                          <th className="border p-1 text-[9px] md:text-xs w-[15%]">Cash</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[15%]">Qris</th>
                          <th className="border p-1 text-[9px] md:text-xs w-[15%]">Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dataRincianAktif.map((p, idx) => {
                          const isCash = p.metode_bayar === 'Cash';
                          return (
                            <tr key={p.id} className="hover:bg-gray-50 text-center">
                              <td className="border p-1 text-[9px] md:text-xs">{idx + 1}</td>
                              <td className="border p-1 text-[9px] md:text-xs font-bold text-left break-words">
                                {p.nama} / {p.kursi}
                                {p.is_balita && <span className="text-[8px] md:text-[10px] text-orange-600 ml-1">(Balita)</span>}
                              </td>
                              <td className="border p-1 text-[9px] md:text-xs">{potongKode(p.kode_tiket)}</td>
                              <td className="border p-1 text-[9px] md:text-xs font-bold">{isCash && p.harga > 0 ? `Rp ${p.harga.toLocaleString('id-ID')}` : '-'}</td>
                              <td className="border p-1 text-[9px] md:text-xs font-bold">{!isCash && p.harga > 0 ? `Rp ${p.harga.toLocaleString('id-ID')}` : '-'}</td>
                              <td className="border p-1 text-[9px] md:text-xs font-bold">{p.harga > 0 ? `Rp ${p.harga.toLocaleString('id-ID')}` : '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-600 text-white font-bold text-center flex-shrink-0 w-full">
                    <div className="flex w-full">
                      <div className="p-2 border text-[9px] md:text-xs text-center w-[50%]">TOTAL</div>
                      <div className="p-2 border text-[9px] md:text-xs text-center w-[15%]">
                        Rp {dataRincianAktif.filter(r => r.metode_bayar === 'Cash').reduce((s, x) => s + x.harga, 0).toLocaleString('id-ID')}
                      </div>
                      <div className="p-2 border text-[9px] md:text-xs text-center w-[15%]">
                        Rp {dataRincianAktif.filter(r => r.metode_bayar === 'QRIS').reduce((s, x) => s + x.harga, 0).toLocaleString('id-ID')}
                      </div>
                      <div className="p-2 border text-[9px] md:text-xs text-center w-[20%]">
                        Rp {dataRincianAktif.reduce((s, x) => s + x.harga, 0).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {view === 'boarding' && (
            <div className="space-y-4 overflow-y-auto">
              <div>
                <h2 className="text-sm md:text-lg font-bold text-gray-800 mb-2 border-b pb-1">OPEN SCHEDULE</h2>
                {laporanBelumClosed.length === 0 ? (
                  <p className="text-gray-500 bg-white p-3 rounded shadow text-xs md:text-sm">Belum ada jadwal untuk waktu yang akan datang.</p>
                ) : (
                  <div className="space-y-2">
                    {laporanBelumClosed.map((l) => {
                      const boardingList = l.rincian.filter(p => p.status_boarding === 'sudah')
                      return (
                        <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                          <div className="bg-blue-50 px-3 py-2 md:px-4 md:py-3 border-b flex justify-between items-center">
                            <div className="flex items-center gap-2 md:gap-3">
                              <span className="font-bold text-xs md:text-sm text-gray-900">Scan Boarding Jam {l.jam}</span>
                              <span className="text-[9px] md:text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">Berjalan</span>
                            </div>
                            <span className="text-[10px] md:text-sm font-bold text-blue-600">{boardingList.length} / {l.total_terjual} Boarding</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-gray-900">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">No</th>
                                  <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Nama / Kursi</th>
                                  <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Waktu Scan</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {boardingList.length === 0 ? (
                                  <tr>
                                    <td colSpan={3} className="px-2 py-3 text-center text-[10px] md:text-xs text-gray-500">Belum ada yang boarding.</td>
                                  </tr>
                                ) : (
                                  boardingList
                                    .sort((a, b) => {
                                      if (!a.waktu_boarding) return 1;
                                      if (!b.waktu_boarding) return -1;
                                      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
                                    })
                                    .map((p, idx) => (
                                    <tr key={p.id} className="hover:bg-gray-50 text-center">
                                      <td className="px-2 py-2 text-[10px] md:text-xs text-gray-500">{idx + 1}</td>
                                      <td className="px-2 py-2 text-[10px] md:text-xs font-bold text-gray-900">
                                        {p.nama} / {p.kursi}
                                        {p.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
                                      </td>
                                      <td className="px-2 py-2 text-[10px] md:text-xs text-gray-600">
                                        {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center border-b pb-1 mb-2">
                  <h2 className="text-sm md:text-lg font-bold text-gray-800">CLOSING SCHEDULE</h2>
                  <button onClick={() => handlePrint('rekap-boarding')} className="bg-blue-600 text-white px-2 py-1 rounded text-[10px] md:text-sm hover:bg-blue-700">🖨️ Cetak</button>
                </div>
                {laporanSudahClosed.length === 0 ? (
                  <p className="text-gray-500 bg-white p-3 rounded shadow text-xs md:text-sm">Belum ada jadwal yang closing pada tanggal ini.</p>
                ) : (
                  <div className="space-y-2">
                    {laporanSudahClosed.map((l) => {
                      const boardingList = l.rincian.filter(p => p.status_boarding === 'sudah')
                      return (
                        <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                          <button 
                            onClick={() => setExpandedJam(expandedJam === l.jam ? null : l.jam)}
                            className="w-full px-3 py-2 md:px-4 md:py-3 flex justify-between items-center hover:bg-gray-50 transition"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              <span className="font-bold text-xs md:text-sm text-gray-900">Scan Boarding Jam {l.jam}</span>
                              <span className="text-[9px] md:text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Closed</span>
                            </div>
                            <div className="flex items-center gap-2 md:gap-4">
                              <span className="text-[10px] md:text-sm font-bold text-blue-600">{boardingList.length} / {l.total_terjual} Boarding</span>
                              <span className="text-blue-600 text-[10px]">{expandedJam === l.jam ? '▲' : '▼'}</span>
                            </div>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {expandedJam && rincianAktif && (
                <div className="mt-4">
                  <div className="bg-white rounded shadow border-2 border-blue-400 overflow-hidden">
                    <div className="bg-blue-600 text-white p-3 flex justify-between items-center flex-wrap gap-2">
                      <h3 className="font-bold text-xs md:text-base">Rincian Boarding Jam {expandedJam}</h3>
                      <div className="flex gap-2">
                        <button onClick={() => handlePrint('rincian-boarding')} className="bg-white text-blue-700 px-2 py-1 rounded text-[10px] md:text-sm font-bold hover:bg-gray-100">🖨️ Cetak</button>
                        <button onClick={() => setExpandedJam(null)} className="bg-red-600 text-white px-2 py-1 rounded text-[10px] md:text-sm font-bold hover:bg-red-700">Tutup</button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-gray-900">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">No</th>
                            <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Nama / Kursi</th>
                            <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Rute / Nama Kapal</th>
                            <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Kode</th>
                            <th className="px-2 py-2 text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase">Waktu Scan</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {rincianAktif.rincian.filter(p => p.status_boarding === 'sudah')
                            .sort((a, b) => new Date(a.waktu_boarding!).getTime() - new Date(b.waktu_boarding!).getTime())
                            .map((p, idx) => (
                            <tr key={p.id} className="hover:bg-gray-50 text-center">
                              <td className="px-2 py-2 text-[10px] md:text-xs text-gray-500">{idx + 1}</td>
                              <td className="px-2 py-2 text-[10px] md:text-xs font-bold text-gray-900">
                                {p.nama} / {p.kursi}
                                {p.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
                              </td>
                              <td className="px-2 py-2 text-[10px] md:text-xs text-gray-700">{p.rute} / {p.nama_kapal}</td>
                              <td className="px-2 py-2 text-[10px] md:text-xs text-gray-600">{potongKode(p.kode_tiket)}</td>
                              <td className="px-2 py-2 text-[10px] md:text-xs text-gray-600">
                                {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= TAMPILAN PRINT ================= */}
        
        <div className="hidden print-rekap-harian mt-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">Rekapan Laporan Penjualan {ruteLengkap}</h1>
            <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1 print-info">
              <span>Petugas</span><span>:</span><span>{profile.nama}</span>
              <span>Tanggal</span><span>:</span><span>{tanggal}</span>
              <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
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
              {[...laporanBelumClosed, ...laporanSudahClosed].sort((a,b)=>a.jam.localeCompare(b.jam)).map((l) => (
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
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalCashHarian.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalQrisHarian.toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalPenjualanHarian.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {selectedJam && (
          <div className="hidden print-rekap-petugas mt-8">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-gray-900">Rekap Petugas Jam {selectedJam}</h1>
              <div className="text-sm text-left mt-4 grid grid-cols-[100px_10px_1fr] gap-y-1 print-info">
                <span>Petugas</span><span>:</span><span>{profile.nama}</span>
                <span>Tanggal</span><span>:</span><span>{tanggal}</span>
              </div>
            </div>
            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-200 text-center text-gray-900">
                  <th className="border border-gray-400 px-2 py-2">Petugas</th>
                  <th className="border border-gray-400 px-2 py-2">Total Penumpang</th>
                  <th className="border border-gray-400 px-2 py-2">Cash</th>
                  <th className="border border-gray-400 px-2 py-2">Qris</th>
                  <th className="border border-gray-400 px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {getRekapPetugas(selectedJam).map((pt) => (
                  <tr key={pt.nama} className="text-center text-gray-900">
                    <td className="border border-gray-400 px-2 py-1 font-bold text-center">{pt.nama}</td>
                    <td className="border border-gray-400 px-2 py-1">{pt.jumlah}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">Rp {pt.cash.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">Rp {pt.qris.toLocaleString('id-ID')}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right font-bold">Rp {pt.total.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                {(() => {
                  const dataPt = getRekapPetugas(selectedJam);
                  const tJumlah = dataPt.reduce((s, x) => s + x.jumlah, 0);
                  const tCash = dataPt.reduce((s, x) => s + x.cash, 0);
                  const tQris = dataPt.reduce((s, x) => s + x.qris, 0);
                  const tTotal = dataPt.reduce((s, x) => s + x.total, 0);
                  return (
                    <tr className="font-bold bg-gray-300 text-center text-gray-900">
                      <td className="border border-gray-400 px-2 py-1 text-center">TOTAL</td>
                      <td className="border border-gray-400 px-2 py-1">{tJumlah}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {tCash.toLocaleString('id-ID')}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {tQris.toLocaleString('id-ID')}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {tTotal.toLocaleString('id-ID')}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        )}

        {selectedJam && selectedPetugas && (
          <div className="hidden print-rincian-penumpang mt-8">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-gray-900">Rincian Laporan Penjualan - {selectedPetugas}</h1>
              
              {/* PERBAIKAN: TABLE INFO PRINT RATA KIRI */}
              <table className="text-sm text-left mt-4" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '300px' }}>
                <tbody>
                  <tr>
                    <td className="align-top" style={{ width: '130px' }}>Petugas</td>
                    <td className="align-top" style={{ width: '10px' }}>:</td>
                    <td className="align-top">{profile.nama}</td>
                  </tr>
                  <tr>
                    <td className="align-top">Tanggal</td>
                    <td className="align-top">:</td>
                    <td className="align-top">{tanggal}</td>
                  </tr>
                  <tr>
                    <td className="align-top">Jam</td>
                    <td className="align-top">:</td>
                    <td className="align-top">{selectedJam}</td>
                  </tr>
                  <tr>
                    <td className="align-top">Total Penumpang</td>
                    <td className="align-top">:</td>
                    <td className="align-top">{dataRincianAktif.length} Orang</td>
                  </tr>
                  <tr>
                    <td className="align-top"></td>
                    <td className="align-top"></td>
                    <td className="align-top">Dewasa {jmlDewasa} Orang | Balita {jmlBalita} Orang</td>
                  </tr>
                </tbody>
              </table>

            </div>
            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-200 text-center text-gray-900">
                  <th className="border border-gray-400 px-2 py-2 w-[5%]" rowSpan={2}>No</th>
                  <th className="border border-gray-400 px-2 py-2 text-left w-[35%]" rowSpan={2}>Nama / Kursi</th>
                  <th className="border border-gray-400 px-2 py-2 w-[15%]" rowSpan={2}>Kode Tiket</th>
                  <th className="border border-gray-400 px-2 py-2" colSpan={3}>Penjualan</th>
                </tr>
                <tr className="bg-gray-200 text-center text-gray-900">
                  <th className="border border-gray-400 px-2 py-1 w-[15%]">Cash</th>
                  <th className="border border-gray-400 px-2 py-1 w-[15%]">Qris</th>
                  <th className="border border-gray-400 px-2 py-1 w-[15%]">Total</th>
                </tr>
              </thead>
              <tbody>
                {dataRincianAktif.map((d, idx) => {
                  const isCash = d.metode_bayar === 'Cash';
                  return (
                    <tr key={d.id} className="text-center text-gray-900">
                      <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                      <td className="border border-gray-400 px-2 py-1 text-left font-bold">
                        {d.nama} / {d.kursi}
                        {d.is_balita && <span className="text-xs text-orange-600 ml-1">(Balita)</span>}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-xs">{potongKode(d.kode_tiket)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{isCash && d.harga > 0 ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{!isCash && d.harga > 0 ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right font-bold">{d.harga > 0 ? `Rp ${d.harga.toLocaleString('id-ID')}` : '-'}</td>
                    </tr>
                  )
                })}
                {(() => {
                  const totalCash = dataRincianAktif.filter(r => r.metode_bayar === 'Cash').reduce((s, x) => s + x.harga, 0);
                  const totalQris = dataRincianAktif.filter(r => r.metode_bayar === 'QRIS').reduce((s, x) => s + x.harga, 0);
                  const totalHarga = dataRincianAktif.reduce((s, x) => s + x.harga, 0);
                  
                  return (
                    <tr className="font-bold bg-gray-300 text-center text-gray-900">
                      <td colSpan={3} className="border border-gray-400 px-2 py-1 text-right">TOTAL</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalCash.toLocaleString('id-ID')}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalQris.toLocaleString('id-ID')}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">Rp {totalHarga.toLocaleString('id-ID')}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        )}

        <div className="hidden print-manifest mt-8">
          <h1 className="text-xl font-bold text-center mb-6">LAPORAN MANIFEST PENUMPANG JAM {selectedJam}</h1>
          <div className="mb-4 text-sm grid grid-cols-[150px_10px_1fr] gap-y-1 print-info">
            <span>Tanggal</span><span>:</span><span>{tanggal}</span>
            <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
            <span>Kapal</span><span>:</span><span>{laporan.find(l => l.jam === selectedJam)?.nama_kapal || '-'}</span>
            <span>Kapten</span><span>:</span><span>{laporan.find(l => l.jam === selectedJam)?.rincian[0]?.nama_kapten || '-'}</span>
            <span>Jumlah Penumpang</span><span>:</span><span>{laporan.find(l => l.jam === selectedJam)?.total_terjual || 0} Orang</span>
          </div>
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                <th className="border border-gray-400 px-2 py-1">NAMA / KURSI</th>
                <th className="border border-gray-400 px-2 py-1">KODE</th>
                <th className="border border-gray-400 px-2 py-1">WAKTU SCAN</th>
              </tr>
            </thead>
            <tbody>
              {laporan.find(l => l.jam === selectedJam)?.rincian.map((p, idx) => (
                <tr key={p.id} className="text-gray-900 text-center">
                  <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                  <td className="border border-gray-400 px-2 py-1 font-bold text-center">
                    {p.nama} / {p.kursi}
                    {p.is_balita && <span className="text-xs text-orange-600 ml-1">(Balita)</span>}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-xs">{potongKode(p.kode_tiket)}</td>
                  <td className="border border-gray-400 px-2 py-1">
                    {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td colSpan={3} className="border border-gray-400 px-2 py-1 text-center">TOTAL PENUMPANG</td>
                <td className="border border-gray-400 px-2 py-1 text-center">{laporan.find(l => l.jam === selectedJam)?.total_terjual || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="hidden print-rekap-boarding mt-8">
          <h1 className="text-xl font-bold text-center mb-6">LAPORAN REKAP SCAN BOARDING</h1>
          <div className="mb-4 text-sm grid grid-cols-[100px_10px_1fr] gap-y-1 print-info">
            <span>Per Tanggal</span><span>:</span><span>{tanggal}</span>
            <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
          </div>
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-2 py-1">JAM</th>
                <th className="border border-gray-400 px-2 py-1">JUMLAH PENUMPANG</th>
                <th className="border border-gray-400 px-2 py-1">SUDAH BOARDING</th>
              </tr>
            </thead>
            <tbody>
              {laporan.map((l) => {
                const boardingCount = l.rincian.filter(p => p.status_boarding === 'sudah').length
                return (
                  <tr key={l.jam} className="text-center text-gray-900">
                    <td className="border border-gray-400 px-2 py-1">{l.jam}</td>
                    <td className="border border-gray-400 px-2 py-1">{l.total_terjual}</td>
                    <td className="border border-gray-400 px-2 py-1">{boardingCount}</td>
                  </tr>
                )
              })}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td className="border border-gray-400 px-2 py-1 text-center">TOTAL</td>
                <td className="border border-gray-400 px-2 py-1 text-center">{totalPenumpang}</td>
                <td className="border border-gray-400 px-2 py-1 text-center">{totalBoarding}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {expandedJam && rincianAktif && (
          <div className="hidden print-rincian-boarding mt-8">
            <h1 className="text-xl font-bold text-center mb-6">LAPORAN RINCIAN SCAN BOARDING JAM {expandedJam}</h1>
            <div className="mb-4 text-sm grid grid-cols-[100px_10px_1fr] gap-y-1 print-info">
              <span>Tanggal</span><span>:</span><span>{tanggal}</span>
              <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
            </div>
            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-200 text-center text-gray-900">
                  <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">NAMA / KURSI</th>
                  <th className="border border-gray-400 px-2 py-1">KAPAL</th>
                  <th className="border border-gray-400 px-2 py-1">KODE</th>
                  <th className="border border-gray-400 px-2 py-1">WAKTU SCAN</th>
                </tr>
              </thead>
              <tbody>
                {rincianAktif.rincian.filter(p => p.status_boarding === 'sudah')
                  .sort((a, b) => new Date(a.waktu_boarding!).getTime() - new Date(b.waktu_boarding!).getTime())
                  .map((p, idx) => (
                  <tr key={p.id} className="text-center text-gray-900">
                    <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                    <td className="border border-gray-400 px-2 py-1 font-bold text-center">
                      {p.nama} / {p.kursi}
                      {p.is_balita && <span className="text-xs text-orange-600 ml-1">(Balita)</span>}
                    </td>
                    <td className="border border-gray-400 px-2 py-1">{p.nama_kapal}</td>
                    <td className="border border-gray-400 px-2 py-1 text-xs">{potongKode(p.kode_tiket)}</td>
                    <td className="border border-gray-400 px-2 py-1">
                      {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-300 text-center text-gray-900">
                  <td colSpan={4} className="border border-gray-400 px-2 py-1 text-center">TOTAL BOARDING</td>
                  <td className="border border-gray-400 px-2 py-1 text-center">
                    {rincianAktif.rincian.filter(p => p.status_boarding === 'sudah').length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}

export default function LaporanPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <LaporanContent />
    </Suspense>
  )
}