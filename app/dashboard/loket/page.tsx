'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, logoutOperator, catatAudit, getOperatorSession, type Profile } from '@/lib/supabase'

type JadwalTampil = {
  id: string | null
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
  kapal_id: string
  kapasitas: number
  kursi_kosong: number
  total_kursi: number
  menitTersisa: number
  status: 'open' | 'closed'
  isGenerated?: boolean
  foto_url?: string | null // TAMBAHAN BARU
}

type PesananCash = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  nomor_hp: string
  jadwal_id: string
  kursi_id: string
  waktu_pesan: string
  grup_transaksi_id: string | null
  rute_asal?: string
  rute_tujuan?: string
  jam_berangkat?: string
  harga?: number
}

type GrupCash = {
  grup_id: string
  pesanan: PesananCash[]
  total_jumlah: number
  waktu_pesan_terawal: string
  rute_asal?: string
  rute_tujuan?: string
  jam_berangkat?: string
  harga?: number
  nomor_hp?: string
}

function getHariIniLokal() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - offset * 60 * 1000)
  return localDate.toISOString().split('T')[0]
}

export default function DashboardLoketPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [tanggalPilihan, setTanggalPilihan] = useState('')

  const [jadwalList, setJadwalList] = useState<JadwalTampil[]>([])
  const [grupCash, setGrupCash] = useState<GrupCash[]>([])
  
  const [konfirmasiLoading, setKonfirmasiLoading] = useState<string | null>(null)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)
  
  const [selectedPesanan, setSelectedPesanan] = useState<string[]>([])
  const [batalLoading, setBatalLoading] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const p = getOperatorSession()
      
      if (!p) {
        router.push('/login')
        return
      }
      
      setProfile(p)
      setTanggalPilihan(getHariIniLokal())
      
      await loadPesananCash()
      setLoading(false)
    }
    loadData()
  }, [router])

  useEffect(() => {
    if (profile && tanggalPilihan) {
      loadJadwal(tanggalPilihan)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggalPilihan, profile])

  async function loadJadwal(tgl: string) {
    const lokasiOperator = (profile as any)?.lokasi || 'Tarakan'
    
    const { data: jadwalData, error: errJ } = await supabase
      .from('jadwal')
      .select('id, rute_asal, rute_tujuan, jam_berangkat, tanggal, harga, kapal_id, status_jadwal')
      .eq('tanggal', tgl)
      .eq('status', 'aktif')

    if (errJ) {
      setError('Gagal ambil jadwal: ' + errJ.message)
      return
    }

    const { data: templates } = await supabase
      .from('template_jadwal')
      .select('*')
      .eq('aktif', true)
      .eq('rute_asal', lokasiOperator) 

    // Ambil data kapal beserta foto_url
    const { data: kapalData } = await supabase.from('kapal').select('id, nama, kapasitas, foto_url')
    const kapalMap = new Map(kapalData?.map((k) => [k.id, k]) || [])

    const finalList: JadwalTampil[] = []
    const sekarang = new Date()
    const hariIniLokal = getHariIniLokal()
    const isHariIni = tgl === hariIniLokal

    const jadwalMap = new Map(jadwalData?.map((j) => [j.jam_berangkat.slice(0,5) + '-' + j.kapal_id, j]) || [])

    if (templates) {
      for (const t of templates) {
        const kapal = kapalMap.get(t.kapal_id)
        if (!kapal) continue

        const jamStr = String(t.jam_berangkat).slice(0, 5)
        if (!jamStr.includes(':')) continue

        const key = jamStr + '-' + t.kapal_id
        const existingJadwal = jadwalMap.get(key)

        const [jam, menit] = jamStr.split(':').map(Number)
        const target = new Date(tgl + 'T00:00:00')
        target.setHours(jam, menit, 0, 0)
        
        const menitTersisa = isHariIni ? Math.floor((target.getTime() - sekarang.getTime()) / 60000) : 999
        const status = (isHariIni && menitTersisa < 15) ? 'closed' : 'open'

        if (existingJadwal) {
          if (existingJadwal.status_jadwal === 'berangkat') continue

          const { data: kursiData } = await supabase.from('kursi').select('status').eq('jadwal_id', existingJadwal.id)
          const total = kursiData?.length || 0
          const terisi = kursiData?.filter((k) => k.status === 'terisi').length || 0
          const hold = kursiData?.filter((k) => k.status === 'hold').length || 0

          finalList.push({
            id: existingJadwal.id,
            rute_asal: existingJadwal.rute_asal,
            rute_tujuan: existingJadwal.rute_tujuan,
            jam_berangkat: existingJadwal.jam_berangkat,
            harga: existingJadwal.harga,
            nama_kapal: kapal.nama,
            kapal_id: kapal.id,
            kapasitas: kapal.kapasitas,
            kursi_kosong: total - terisi - hold,
            total_kursi: total,
            menitTersisa,
            status,
            isGenerated: false,
            foto_url: kapal.foto_url // TAMBAHAN BARU
          })
        } else {
          finalList.push({
            id: null,
            rute_asal: t.rute_asal,
            rute_tujuan: t.rute_tujuan,
            jam_berangkat: jamStr,
            harga: 150000,
            nama_kapal: kapal.nama,
            kapal_id: kapal.id,
            kapasitas: kapal.kapasitas,
            kursi_kosong: kapal.kapasitas,
            total_kursi: kapal.kapasitas,
            menitTersisa,
            status,
            isGenerated: true,
            foto_url: kapal.foto_url // TAMBAHAN BARU
          })
        }
      }
    }

    finalList.sort((a, b) => a.jam_berangkat.localeCompare(b.jam_berangkat))
    setJadwalList(finalList)
  }

  async function loadPesananCash() {
    const { data: p, error: errP } = await supabase
      .from('pesanan')
      .select('id, nama_penumpang, kode_tiket, nomor_hp, jadwal_id, kursi_id, waktu_pesan, grup_transaksi_id')
      .eq('kanal', 'loket')
      .eq('status', 'pending')
      .order('waktu_pesan', { ascending: true })

    if (errP) {
      setError('Gagal ambil pesanan cash: ' + errP.message)
      return
    }

    const enriched: PesananCash[] = []
    for (const item of p || []) {
      const { data: j } = await supabase.from('jadwal').select('rute_asal, rute_tujuan, jam_berangkat, harga').eq('id', item.jadwal_id).single()
      
      if (j?.rute_asal === (profile as any)?.lokasi) {
        enriched.push({ ...item, rute_asal: j?.rute_asal, rute_tujuan: j?.rute_tujuan, jam_berangkat: j?.jam_berangkat, harga: j?.harga })
      }
    }

    const grupMap = new Map<string, GrupCash>()
    for (const item of enriched) {
      const key = item.grup_transaksi_id || item.id
      if (!grupMap.has(key)) {
        grupMap.set(key, { grup_id: key, pesanan: [], total_jumlah: 0, waktu_pesan_terawal: item.waktu_pesan, rute_asal: item.rute_asal, rute_tujuan: item.rute_tujuan, jam_berangkat: item.jam_berangkat, harga: item.harga, nomor_hp: item.nomor_hp })
      }
      const g = grupMap.get(key)!
      g.pesanan.push(item)
      g.total_jumlah += item.harga || 0
      if (item.waktu_pesan < g.waktu_pesan_terawal) g.waktu_pesan_terawal = item.waktu_pesan
    }
    setGrupCash(Array.from(grupMap.values()))
    setSelectedPesanan([])
  }

  function togglePesanan(id: string) {
    setSelectedPesanan((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function toggleGrup(grup: GrupCash) {
    const idsGrup = grup.pesanan.map((p) => p.id)
    const isAllSelected = idsGrup.every((id) => selectedPesanan.includes(id))
    if (isAllSelected) {
      setSelectedPesanan((prev) => prev.filter((id) => !idsGrup.includes(id)))
    } else {
      setSelectedPesanan((prev) => Array.from(new Set([...prev, ...idsGrup])))
    }
  }

  async function handleKonfirmasiCentang() {
    if (!profile) return
    if (selectedPesanan.length === 0) {
      setPesan({ tipe: 'err', teks: 'Pilih minimal 1 tiket dengan centang.' })
      return
    }

    const pesananDicentang = grupCash.flatMap((g) => g.pesanan).filter((p) => selectedPesanan.includes(p.id))
    const totalBayar = pesananDicentang.reduce((sum, p) => sum + (p.harga || 0), 0)
    const daftarNama = pesananDicentang.map((p, i) => `${i + 1}. ${p.nama_penumpang}`).join('\n')

    const ok = confirm(
      `⚠️ PASTIKAN UANG SUDAH DITERIMA UTUH ⚠️\n\n` +
      `Konfirmasi pembayaran CASH untuk ${pesananDicentang.length} tiket:\n\n` +
      `${daftarNama}\n\n` +
      `Total: Rp ${totalBayar.toLocaleString('id-ID')}\n\n` +
      `Lanjutkan?`
    )
    if (!ok) return

    setKonfirmasiLoading('proses')
    setPesan(null)

    const waktuKonfirmasi = new Date().toISOString()
    const ids = pesananDicentang.map((p) => p.id)
    const kursiIds = pesananDicentang.map((p) => p.kursi_id)

    const { error: errP } = await supabase.from('pesanan').update({
      status: 'paid', waktu_bayar: waktuKonfirmasi, petugas_konfirmasi: profile.email, waktu_konfirmasi: waktuKonfirmasi,
    }).in('id', ids)

    if (errP) {
      setPesan({ tipe: 'err', teks: 'Gagal update pesanan: ' + errP.message })
      setKonfirmasiLoading(null)
      return
    }

    await supabase.from('kursi').update({ status: 'terisi' }).in('id', kursiIds)

    const pembayaranData = pesananDicentang.map((p) => ({
      pesanan_id: p.id, metode: 'cash_loket', jumlah: p.harga || 0, status: 'sukses', waktu_bayar: waktuKonfirmasi,
    }))
    await supabase.from('pembayaran').insert(pembayaranData)

    await catatAudit(profile as any, 'konfirmasi_cash', {
      mode: 'loket',
      jumlah_tiket: pesananDicentang.length,
      total_bayar: totalBayar,
      daftar_penumpang: pesananDicentang.map((p) => ({
        nama: p.nama_penumpang, kode_tiket: p.kode_tiket, kursi_id: p.kursi_id, jumlah: p.harga || 0,
      })),
    })

    setPesan({ tipe: 'ok', teks: `Pembayaran ${pesananDicentang.length} tiket berhasil dikonfirmasi.` })
    await loadPesananCash()
    await loadJadwal(tanggalPilihan)
    setKonfirmasiLoading(null)
  }

  async function handleBatalPesanan(pesanan: PesananCash) {
    const konfirmasi = confirm(`Batalkan tiket atas nama ${pesanan.nama_penumpang}?\n\nKursi akan langsung dilepas.`)
    if (!konfirmasi) return

    setBatalLoading(pesanan.id)
    setPesan(null)

    const { error: errP } = await supabase.from('pesanan').update({ status: 'batal' }).eq('id', pesanan.id)
    if (errP) {
      setPesan({ tipe: 'err', teks: 'Gagal batalkan pesanan: ' + errP.message })
      setBatalLoading(null)
      return
    }

    await supabase.from('kursi').update({ status: 'kosong' }).eq('id', pesanan.kursi_id)

    setSelectedPesanan((prev) => prev.filter((id) => id !== pesanan.id))

    setPesan({ tipe: 'ok', teks: `Tiket ${pesanan.nama_penumpang} dibatalkan, kursi telah dilepas.` })
    await loadPesananCash()
    await loadJadwal(tanggalPilihan)
    setBatalLoading(null)
  }

  async function handleJualTiket(j: JadwalTampil) {
    let jadwalId = j.id

    if (j.isGenerated || !jadwalId) {
      const { data: existing } = await supabase
        .from('jadwal')
        .select('id')
        .eq('kapal_id', j.kapal_id)
        .eq('rute_asal', j.rute_asal)
        .eq('rute_tujuan', j.rute_tujuan)
        .eq('tanggal', tanggalPilihan)
        .eq('jam_berangkat', j.jam_berangkat)
        .maybeSingle()

      if (existing?.id) {
        jadwalId = existing.id
      } else {
        const { data: baru, error: errInsert } = await supabase
          .from('jadwal')
          .insert({
            kapal_id: j.kapal_id,
            rute_asal: j.rute_asal,
            rute_tujuan: j.rute_tujuan,
            tanggal: tanggalPilihan,
            jam_berangkat: j.jam_berangkat,
            harga: j.harga,
            status: 'aktif',
          })
          .select()
          .single()

        if (errInsert || !baru) {
          alert('Gagal buat jadwal: ' + (errInsert?.message || 'unknown'))
          return
        }

        jadwalId = baru.id

        const kursiData = []
        for (let i = 1; i <= j.kapasitas; i++) {
          kursiData.push({
            jadwal_id: jadwalId,
            nomor_kursi: String(i).padStart(2, '0'),
            status: 'kosong',
          })
        }
        await supabase.from('kursi').insert(kursiData)
      }
    }

    router.push(`/loket-jual?jadwal=${jadwalId}`)
  }

  function handleLogout() {
    logoutOperator()
  }

  function formatWaktu(iso: string) {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return `${diff} detik lalu`
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
    return `${Math.floor(diff / 3600)} jam lalu`
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat dashboard...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  let labelRole = 'Operator'
  if (profile.role === 'petugas_loket') labelRole = 'Operator Loket'
  if (profile.role === 'petugas_mobile') labelRole = 'Operator Mobile'
  if (profile.role === 'terminal_keberangkatan') labelRole = 'Operator Keberangkatan'
  
  const totalBayarCentang = grupCash.flatMap((g) => g.pesanan).filter((p) => selectedPesanan.includes(p.id)).reduce((sum, p) => sum + (p.harga || 0), 0)

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Dashboard {labelRole} {profile.lokasi}</h1>
              <span className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-bold">
                {profile.nama}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => router.push('/dashboard/loket-menu')}
              className="text-sm text-gray-600 hover:text-blue-600 bg-white px-3 py-2 rounded shadow-sm border border-gray-200 font-medium"
            >
              ← Menu Utama
            </button>
            <button onClick={handleLogout} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm">Logout</button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-300 p-3 rounded mb-4">
          <p className="text-blue-800 text-xs">💡 Penjualan loket hanya bisa dilakukan sampai <b>15 menit sebelum keberangkatan</b>.</p>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded shadow mb-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="font-bold text-yellow-900 mb-1">💵 Pesanan Cash Menunggu Konfirmasi</h2>
              <p className="text-xs text-yellow-800">Centang penumpang yang benar-benar berangkat & sudah bayar.</p>
            </div>
            {selectedPesanan.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Total Centang: {selectedPesanan.length} tiket</p>
                <button onClick={handleKonfirmasiCentang} disabled={konfirmasiLoading === 'proses'} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 disabled:bg-gray-400 font-bold text-sm">
                  {konfirmasiLoading === 'proses' ? 'Memproses...' : `✓ Konfirmasi & Cetak (Rp ${totalBayarCentang.toLocaleString('id-ID')})`}
                </button>
              </div>
            )}
          </div>

          {grupCash.length === 0 ? (
            <p className="text-gray-600 text-sm">Tidak ada pesanan cash yang menunggu.</p>
          ) : (
            <div className="space-y-4">
              {grupCash.map((g) => {
                const isAllSelected = g.pesanan.every((p) => selectedPesanan.includes(p.id))
                return (
                  <div key={g.grup_id} className="bg-white border rounded overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                      <div className="text-xs text-gray-600">
                        <b>Rute:</b> {g.rute_asal} → {g.rute_tujuan} • <b>Jam:</b> {g.jam_berangkat} • <b>HP:</b> {g.nomor_hp} • <span className="text-gray-400">Dipesan {formatWaktu(g.waktu_pesan_terawal)}</span>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                        <input type="checkbox" checked={isAllSelected} onChange={() => toggleGrup(g)} className="w-4 h-4 text-blue-600 rounded" />
                        Centang Semua
                      </label>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {g.pesanan.map((p, idx) => (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 w-10 text-center">
                              <input type="checkbox" checked={selectedPesanan.includes(p.id)} onChange={() => togglePesanan(p.id)} className="w-4 h-4 text-blue-600 rounded cursor-pointer" />
                            </td>
                            <td className="px-2 py-3 text-gray-500 text-xs w-8">{idx + 1}.</td>
                            <td className="px-2 py-3 font-bold text-gray-900">{p.nama_penumpang}</td>
                            <td className="px-2 py-3 font-mono text-xs text-gray-600">{p.kode_tiket}</td>
                            <td className="px-2 py-3 text-right font-bold text-blue-600">Rp {(p.harga || 0).toLocaleString('id-ID')}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleBatalPesanan(p)} disabled={batalLoading === p.id} className="text-red-600 text-xs hover:underline font-medium">
                                {batalLoading === p.id ? '...' : 'Batal'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">Jadwal Bisa Dijual</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Tanggal</label>
              {tanggalPilihan && (
                <input
                  type="date"
                  value={tanggalPilihan}
                  onChange={(e) => setTanggalPilihan(e.target.value)}
                  className="border rounded px-3 py-1 text-sm text-gray-900"
                />
              )}
            </div>
          </div>
          
          {jadwalList.length === 0 ? (
            <p className="text-gray-700 text-sm">Tidak ada jadwal untuk tanggal ini.</p>
          ) : (
            <div className="space-y-3">
              {jadwalList.map((j, idx) => (
                <div key={idx} className={`border rounded p-4 flex justify-between items-center ${j.status === 'closed' ? 'opacity-50 bg-gray-50' : ''}`}>
                  
                  {/* TAMPILAN GAMBAR KAPAL */}
                  <div className="w-20 h-14 bg-gray-100 rounded border overflow-hidden flex items-center justify-center mr-4 flex-shrink-0">
                    {j.foto_url ? (
                      <img src={j.foto_url} alt={j.nama_kapal} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">No Foto</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="font-bold text-lg text-gray-900">{j.rute_asal} → {j.rute_tujuan}</p>
                    <p className="text-sm text-gray-700">{j.nama_kapal} • Jam {j.jam_berangkat}</p>
                    <p className="text-sm text-gray-700 mt-1">
                      Sisa kursi: <span className="font-bold text-green-700">{j.kursi_kosong}</span> / {j.total_kursi}
                    </p>
                  </div>
                  <div className="text-right flex flex-col gap-2">
                    <p className="font-bold text-blue-600">Rp {j.harga.toLocaleString('id-ID')}</p>
                    
                    <div className="flex flex-col gap-1 mt-2">
                      {j.status === 'open' && (
                        <button onClick={() => handleJualTiket(j)} className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium">
                          Jual Tiket →
                        </button>
                      )}
                      
                      {j.id && (
                        <button onClick={() => router.push(`/daftar-penumpang?jadwal=${j.id}`)} className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700">
                          Lihat Penumpang
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}