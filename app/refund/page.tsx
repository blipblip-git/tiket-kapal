'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, catatAudit, type Profile } from '@/lib/supabase'

type Jadwal = {
  id: string
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
}

type PesananPaid = {
  id: string
  nama_penumpang: string
  nik: string
  nomor_hp: string
  kode_tiket: string
}

export default function RefundPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  const [jadwalList, setJadwalList] = useState<Jadwal[]>([])
  const [jadwalTerpilih, setJadwalTerpilih] = useState<Jadwal | null>(null)
  const [pesananList, setPesananList] = useState<PesananPaid[]>([])
  
  const [sedangProses, setSedangProses] = useState(false)
  const [isSelesai, setIsSelesai] = useState(false) // Penanda udah sukses refund
  const [alasan, setAlasan] = useState('Kapal rusak / tidak ada pengganti (Force Majeure)')

  useEffect(() => {
    async function init() {
      const p = await getProfile()
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(p)
      await loadJadwal()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadJadwal() {
    const hariIni = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('jadwal')
      .select('id, rute_asal, rute_tujuan, tanggal, jam_berangkat, harga')
      .gte('tanggal', hariIni)
      .neq('status_jadwal', 'berangkat')
      .order('tanggal', { ascending: true })
      .order('jam_berangkat', { ascending: true })

    if (error) {
      setError('Gagal ambil jadwal: ' + error.message)
      return
    }
    setJadwalList(data || [])
  }

  async function handlePilihJadwal(j: Jadwal) {
    setJadwalTerpilih(j)
    setPesan(null)
    setIsSelesai(false)
    
    const { data, error } = await supabase
      .from('pesanan')
      .select('id, nama_penumpang, nik, nomor_hp, kode_tiket')
      .eq('jadwal_id', j.id)
      .eq('status', 'paid')
      .order('nama_penumpang', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal ambil pesanan: ' + error.message })
      return
    }
    setPesananList(data || [])
  }

  async function handleProsesRefund() {
    if (!profile || !jadwalTerpilih) return
    if (pesananList.length === 0) {
      setPesan({ tipe: 'err', teks: 'Tidak ada penumpang aktif untuk direfund.' })
      return
    }

    const konfirmasi = confirm(
      `⚠️ PERINGATAN FORCE MAJEURE ⚠️\n\n` +
      `Anda akan membatalkan jadwal ${jadwalTerpilih.rute_asal} → ${jadwalTerpilih.rute_tujuan} (${jadwalTerpilih.jam_berangkat}).\n` +
      `Total ${pesananList.length} penumpang akan direfund.\n\n` +
      `Pastikan Anda sudah menyiapkan uang tunai sebesar Rp ${(pesananList.length * jadwalTerpilih.harga).toLocaleString('id-ID')} di loket!\n\n` +
      `Lanjutkan?`
    )
    if (!konfirmasi) return

    setSedangProses(true)
    setPesan(null)

    const waktuRefund = new Date().toISOString()
    const ids = pesananList.map(p => p.id)

    // 1. Insert ke tabel refund
    const refundData = pesananList.map(p => ({
      pesanan_id: p.id,
      jadwal_id: jadwalTerpilih.id,
      petugas_refund: profile.email,
      jumlah: jadwalTerpilih.harga,
      alasan: alasan,
      waktu_refund: waktuRefund,
    }))

    const { error: errRefund } = await supabase.from('refund').insert(refundData)
    if (errRefund) {
      setPesan({ tipe: 'err', teks: 'Gagal simpan data refund: ' + errRefund.message })
      setSedangProses(false)
      return
    }

    // 2. Update status pesanan jadi 'refund'
    const { error: errPesanan } = await supabase
      .from('pesanan')
      .update({ status: 'refund' })
      .in('id', ids)

    if (errPesanan) {
      setPesan({ tipe: 'err', teks: 'Gagal update status pesanan: ' + errPesanan.message })
      setSedangProses(false)
      return
    }

    // 3. Update kursi jadi kosong lagi (lepas)
    const { data: kursiData } = await supabase
      .from('pesanan')
      .select('kursi_id')
      .in('id', ids)
    
    if (kursiData) {
      const kursiIds = kursiData.map(k => k.kursi_id)
      await supabase.from('kursi').update({ status: 'kosong' }).in('id', kursiIds)
    }

    // 4. Update status jadwal jadi berangkat/batal biar gak bisa dijual
    await supabase.from('jadwal').update({ status_jadwal: 'berangkat', petugas_closing: profile.email, waktu_closing: waktuRefund }).eq('id', jadwalTerpilih.id)

    // 5. Audit Log
    await catatAudit(profile, 'force_majeure_refund', {
      jadwal_id: jadwalTerpilih.id,
      rute: `${jadwalTerpilih.rute_asal} → ${jadwalTerpilih.rute_tujuan}`,
      jam: jadwalTerpilih.jam_berangkat,
      jumlah_tiket: pesananList.length,
      total_refund: pesananList.length * jadwalTerpilih.harga,
      alasan: alasan,
    })

    setIsSelesai(true)
    setSedangProses(false)
    await loadJadwal() // Refresh jadwal
  }

  function handlePrint() {
    window.print()
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">Error: {error}</p>

  // ==================== TAMPILAN PRINT / MANIFEST ====================
  if (isSelesai && jadwalTerpilih) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold uppercase">Manifest Refund Penumpang</h1>
            <p className="text-sm mt-1">Force Majeure / Pembatalan Kapal</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p><b>Rute:</b> {jadwalTerpilih.rute_asal} → {jadwalTerpilih.rute_tujuan}</p>
              <p><b>Tanggal:</b> {jadwalTerpilih.tanggal}</p>
              <p><b>Jam:</b> {jadwalTerpilih.jam_berangkat}</p>
            </div>
            <div className="text-right">
              <p><b>Petugas Refund:</b> {profile?.nama}</p>
              <p><b>Waktu:</b> {new Date().toLocaleString('id-ID')}</p>
              <p><b>Alasan:</b> {alasan}</p>
            </div>
          </div>

          <p className="text-sm mb-4">
            Harap paraf di kolom paling kanan sebagai bukti uang tunai sudah diterima dengan benar.
          </p>

          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-gray-400 px-2 py-2 w-10 text-left">No</th>
                <th className="border border-gray-400 px-2 py-2 text-left">Nama Penumpang</th>
                <th className="border border-gray-400 px-2 py-2 text-left">NIK</th>
                <th className="border border-gray-400 px-2 py-2 text-left">No HP</th>
                <th className="border border-gray-400 px-2 py-2 text-right">Nominal</th>
                <th className="border border-gray-400 px-2 py-2 text-center w-24">Paraf</th>
              </tr>
            </thead>
            <tbody>
              {pesananList.map((p, idx) => (
                <tr key={p.id}>
                  <td className="border border-gray-400 px-2 py-2">{idx + 1}</td>
                  <td className="border border-gray-400 px-2 py-2">{p.nama_penumpang}</td>
                  <td className="border border-gray-400 px-2 py-2">{p.nik}</td>
                  <td className="border border-gray-400 px-2 py-2">{p.nomor_hp}</td>
                  <td className="border border-gray-400 px-2 py-2 text-right">Rp {jadwalTerpilih.harga.toLocaleString('id-ID')}</td>
                  <td className="border border-gray-400 px-2 py-4 h-12"></td> {/* Kotak kosong buat paraf */}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={4} className="border border-gray-400 px-2 py-2 text-right">Total Refund</td>
                <td className="border border-gray-400 px-2 py-2 text-right">Rp {(pesananList.length * jadwalTerpilih.harga).toLocaleString('id-ID')}</td>
                <td className="border border-gray-400 px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8 flex justify-between">
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-200 text-gray-800 rounded print:hidden hover:bg-gray-300">← Kembali ke Menu</button>
            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white rounded font-bold print:hidden hover:bg-blue-700">🖨️ Cetak Manifest</button>
          </div>
        </div>
      </div>
    )
  }

  // ==================== TAMPILAN UTAMA (PILIH JADWAL) ====================
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-red-600">🚨 Batalkan Jadwal (Force Majeure)</h1>
            <p className="text-sm text-gray-700">Gunakan ini hanya jika kapal rusak / tidak ada pengganti.</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline">
            ← Kembali
          </button>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* KIRI: Pilih Jadwal */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-bold text-gray-900 mb-4 border-b pb-2">1. Pilih Jadwal yang Batal</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {jadwalList.map((j) => (
                <button
                  key={j.id}
                  onClick={() => handlePilihJadwal(j)}
                  className={`w-full text-left p-3 border rounded text-sm transition ${jadwalTerpilih?.id === j.id ? 'bg-red-50 border-red-500 ring-1 ring-red-500' : 'hover:bg-gray-50'}`}
                >
                  <p className="font-bold">{j.rute_asal} → {j.rute_tujuan}</p>
                  <p className="text-gray-600">{j.tanggal} • Jam {j.jam_berangkat}</p>
                </button>
              ))}
              {jadwalList.length === 0 && <p className="text-sm text-gray-500">Tidak ada jadwal aktif.</p>}
            </div>
          </div>

          {/* KANAN: Daftar Penumpang & Aksi */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-bold text-gray-900 mb-4 border-b pb-2">2. Penumpang Terdampak</h2>
            
            {!jadwalTerpilih ? (
              <p className="text-sm text-gray-500 text-center py-10">Pilih jadwal di sebelah kiri.</p>
            ) : (
              <>
                <div className="mb-4 bg-gray-50 p-3 rounded text-sm">
                  <p><b>Total Penumpang:</b> {pesananList.length} orang</p>
                  <p><b>Total Uang Kembali:</b> Rp {(pesananList.length * jadwalTerpilih.harga).toLocaleString('id-ID')}</p>
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Alasan Pembatalan</label>
                <input 
                  type="text" 
                  value={alasan} 
                  onChange={(e) => setAlasan(e.target.value)}
                  className="w-full border rounded px-3 py-2 mb-4 text-sm text-gray-900" 
                />

                <button
                  onClick={handleProsesRefund}
                  disabled={sedangProses || pesananList.length === 0}
                  className="w-full bg-red-600 text-white py-3 rounded hover:bg-red-700 disabled:bg-gray-400 font-bold"
                >
                  {sedangProses ? 'Memproses...' : `🚨 Batalkan & Refund ${pesananList.length} Tiket`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}