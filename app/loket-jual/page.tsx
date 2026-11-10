'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, catatAudit } from '@/lib/supabase'

type ProfilePetugas = {
  id: string
  nama: string
  role: string
  lokasi: string
  email: string
}

type KursiInfo = {
  id: string
  nomor_kursi: string
  status: string
}

type JadwalInfo = {
  id: string
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  kapal_id: string
  nama_kapal: string
  layout_kursi: string
  kapasitas: number
}

type Penumpang = {
  nama: string
  is_balita: boolean
}

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

function LoketJualContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const jadwalId = searchParams.get('jadwal')

  const [profile, setProfile] = useState<ProfilePetugas | null>(null)
  const [jadwal, setJadwal] = useState<JadwalInfo | null>(null)
  const [kursiList, setKursiList] = useState<KursiInfo[]>([])
  const [kursiDipilih, setKursiDipilih] = useState<string[]>([])
  const [penumpangList, setPenumpangList] = useState<Penumpang[]>([])
  const [noHp, setNoHp] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingSubmit, setLoadingSubmit] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'pilih-kursi' | 'form' | 'qris'>('pilih-kursi')
  
  const [waktuSisa, setWaktuSisa] = useState(300)

  useEffect(() => {
    async function init() {
      setKursiDipilih([])
      setPenumpangList([])
      
      const sesi = localStorage.getItem('petugas_session')
      if (!sesi) {
        router.push('/login')
        return
      }
      const p = JSON.parse(sesi) as ProfilePetugas

      if (
        p.role !== 'petugas_loket' && 
        p.role !== 'petugas_mobile' && 
        p.role !== 'terminal_keberangkatan' && 
        p.role !== 'admin_utama'
      ) {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }
      setProfile(p)

      if (!jadwalId) {
        setError('Jadwal tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: j, error: errJ } = await supabase
        .from('jadwal')
        .select('id, rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal_id, status_jadwal')
        .eq('id', jadwalId)
        .single()

      if (errJ || !j) {
        setError('Jadwal tidak ditemukan')
        setLoading(false)
        return
      }

      if (j.status_jadwal === 'berangkat') {
        setError('Jadwal ini sudah closing — tidak bisa jual tiket lagi.')
        setLoading(false)
        return
      }

      const { data: kap } = await supabase
        .from('kapal')
        .select('nama, kapasitas, layout_kursi')
        .eq('id', j.kapal_id)
        .single()

      setJadwal({
        id: j.id,
        rute_asal: j.rute_asal,
        rute_tujuan: j.rute_tujuan,
        tanggal: j.tanggal,
        jam_berangkat: j.jam_berangkat,
        harga: j.harga,
        kapal_id: j.kapal_id,
        nama_kapal: kap?.nama || '-',
        layout_kursi: kap?.layout_kursi || 'tanpa_layout',
        kapasitas: kap?.kapasitas || 0,
      })

      await fetchKursi()
      setLoading(false)
    }

    init()
  }, [jadwalId, router])

  async function fetchKursi() {
    const { data: kursiData, error: errK } = await supabase
      .from('kursi')
      .select('id, nomor_kursi, status')
      .eq('jadwal_id', jadwalId)

    if (errK) {
      setError('Gagal ambil kursi: ' + errK.message)
      return
    }

    const kursiBersih = (kursiData || []).map((k: any) => {
      if (k.status === 'hold') {
        return { ...k, status: 'kosong' }
      }
      return k
    })

    const sortedKursi = kursiBersih.sort((a: any, b: any) => {
      const numA = parseInt(a.nomor_kursi, 10)
      const numB = parseInt(b.nomor_kursi, 10)
      return numA - numB
    })

    setKursiList(sortedKursi)
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (step === 'qris' && waktuSisa > 0) {
      interval = setInterval(() => {
        setWaktuSisa((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            handleTimeOut()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [step, waktuSisa])

  async function handleTimeOut() {
    await supabase
      .from('kursi')
      .update({ status: 'kosong', waktu_hold: null })
      .in('id', kursiDipilih)
      
    alert('Waktu pembayaran habis. Kursi telah dilepas.')
    setStep('pilih-kursi')
    setKursiDipilih([])
    setWaktuSisa(300)
    await fetchKursi()
  }

  function toggleKursi(kursiId: string, status: string) {
    if (status !== 'kosong') return
    setKursiDipilih((prev) =>
      prev.includes(kursiId)
        ? prev.filter((id) => id !== kursiId)
        : [...prev, kursiId]
    )
  }

  function lanjutKeForm() {
    if (kursiDipilih.length === 0) {
      alert('Pilih minimal 1 kursi dulu bray.')
      return
    }
    setPenumpangList(kursiDipilih.map(() => ({ nama: '', is_balita: false })))
    setStep('form')
  }

  function kembaliKeKursi() {
    setStep('pilih-kursi')
    setPenumpangList([])
    setError('')
    setWaktuSisa(300)
  }

  function updatePenumpang(idx: number, field: keyof Penumpang, value: any) {
    const baru = [...penumpangList]
    baru[idx] = { ...baru[idx], [field]: value }
    setPenumpangList(baru)
  }

  function generateKodeTiket(idx: number, isBalita: boolean) {
    const prefix = isBalita ? 'BALITA-' : 'TKT-'
    return prefix + Date.now() + '-L' + idx + '-' + Math.floor(Math.random() * 1000)
  }

  function generateGrupId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  function getJamTransaksi(date: Date = new Date()) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  async function handleKlikQRIS(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !jadwal) return
    setError('')

    for (let i = 0; i < penumpangList.length; i++) {
      if (!penumpangList[i].nama) {
        setError(`Nama penumpang ${i + 1} wajib diisi`)
        return
      }
    }

    if (!noHp) {
      setError('Nomor HP wajib diisi.')
      return
    }

    setLoadingSubmit(true)

    const waktuHold = new Date().toISOString()
    const { error: errHold } = await supabase
      .from('kursi')
      .update({ status: 'hold', waktu_hold: waktuHold })
      .in('id', kursiDipilih)

    if (errHold) {
      setError('Gagal mengunci kursi. Mungkin sudah diambil orang lain.')
      setLoadingSubmit(false)
      return
    }

    setWaktuSisa(300)
    setStep('qris')
    setLoadingSubmit(false)
  }

  async function handleKonfirmasiBayar() {
    if (!profile || !jadwal) return
    setLoadingSubmit(true)

    const sekarang = new Date()
    const waktuKonfirmasi = sekarang.toISOString()
    const jamTransaksi = getJamTransaksi(sekarang)
    const grupId = generateGrupId()
    
    let kanalPesanan = 'loket'
    if (profile.role === 'petugas_mobile') kanalPesanan = 'mobile'
    if (profile.role === 'terminal_keberangkatan') kanalPesanan = 'keberangkatan'

    const pesananData = penumpangList.map((p, idx) => {
      const namaRapi = toTitleCase(p.nama);
      return {
        jadwal_id: jadwal.id,
        kursi_id: kursiDipilih[idx],
        nama_penumpang: namaRapi,
        // NIK SUDAH DIHAPUS TOTAL
        nomor_hp: noHp,
        kanal: kanalPesanan, 
        status: 'paid',
        kode_tiket: generateKodeTiket(idx, p.is_balita),
        waktu_bayar: waktuKonfirmasi,
        petugas_konfirmasi: profile.email,
        waktu_konfirmasi: waktuKonfirmasi,
        grup_transaksi_id: grupId,
        jam_transaksi: jamTransaksi,
        petugas_jual: profile.email,
        is_balita: p.is_balita,
      }
    })

    const { data: inserted, error: errInsert } = await supabase
      .from('pesanan')
      .insert(pesananData)
      .select()

    if (errInsert || !inserted) {
      setError('Gagal simpan pesanan: ' + (errInsert?.message || 'unknown'))
      setLoadingSubmit(false)
      return
    }

    await supabase
      .from('kursi')
      .update({ status: 'terisi', waktu_hold: null })
      .in('id', kursiDipilih)

    const pembayaranData = inserted.map((p, idx) => ({
      pesanan_id: p.id,
      metode: 'simulasi_online',
      jumlah: penumpangList[idx].is_balita ? 0 : jadwal.harga,
      status: 'sukses',
      waktu_bayar: waktuKonfirmasi,
    }))
    if (pembayaranData.length > 0) {
      await supabase.from('pembayaran').insert(pembayaranData)
    }

    await catatAudit(profile as any, 'jual_langsung_loket', {
      mode: kanalPesanan,
      metode_bayar: 'simulasi_online',
      grup_transaksi_id: grupId,
      jam_transaksi: jamTransaksi,
      jumlah_tiket: inserted.length,
      total_bayar: inserted.reduce((sum, p, idx) => sum + (penumpangList[idx].is_balita ? 0 : jadwal.harga), 0),
      rute: `${jadwal.rute_asal} → ${jadwal.rute_tujuan}`,
      jam_berangkat: jadwal.jam_berangkat,
      nomor_hp: noHp,
      daftar_penumpang: inserted.map((p, idx) => ({
        nama: p.nama_penumpang,
        kode_tiket: p.kode_tiket,
        kursi_id: p.kursi_id,
        jumlah: penumpangList[idx].is_balita ? 0 : jadwal.harga,
        is_balita: penumpangList[idx].is_balita,
      })),
    })

    const ids = inserted.map((p) => p.id).join(',')
    router.push(`/etiket?pesanan=${ids}`)
  }

  function formatWaktuSisa(detik: number) {
    const m = Math.floor(detik / 60)
    const s = detik % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function renderDenahKursi() {
    if (!jadwal) return null
    const layout = jadwal.layout_kursi

    const renderKotak = (k: KursiInfo) => {
      const dipilih = kursiDipilih.includes(k.id)
      const isHold = k.status === 'hold'
      const isTerisi = k.status === 'terisi'
      const disabled = isHold || isTerisi

      let bg = 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200' 
      
      if (dipilih) {
        bg = 'bg-blue-600 text-white border-blue-700 shadow-md'
      } else if (isTerisi) {
        bg = 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
      } else if (isHold) {
        bg = 'bg-yellow-100 text-yellow-800 border-yellow-300 cursor-not-allowed'
      }

      return (
        <button
          key={k.id}
          type="button"
          onClick={() => toggleKursi(k.id, k.status)}
          disabled={disabled}
          className={`w-full h-full flex items-center justify-center text-[10px] md:text-xs font-medium rounded border transition-colors ${bg}`}
          title={`Kursi ${k.nomor_kursi} — ${k.status}`}
        >
          {k.nomor_kursi}
        </button>
      )
    }

    if (layout === '2-3' || layout === '2-2') {
      const kiriCount = layout === '2-3' ? 2 : 2
      const kananCount = layout === '2-3' ? 3 : 2
      const perBaris = kiriCount + kananCount
      const baris: KursiInfo[][] = []
      for (let i = 0; i < kursiList.length; i += perBaris) {
        baris.push(kursiList.slice(i, i + perBaris))
      }

      return (
        <div className="flex flex-col h-full justify-between gap-1">
          {baris.map((row, idx) => (
            <div key={idx} className="flex items-stretch flex-1 gap-2">
              <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
                {row.slice(0, kiriCount).map(renderKotak)}
              </div>
              <div className="w-4" /> {/* Lorong */}
              <div className="grid grid-cols-3 gap-1 md:gap-2 flex-1 max-w-[55%]">
                {row.slice(kiriCount).map(renderKotak)}
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-6 gap-1 md:gap-2 h-full w-full">
        {kursiList.map(renderKotak)}
      </div>
    )
  }

  if (loading) return <p className="p-6 text-center text-gray-900 mt-10">Memuat...</p>
  if (error && !jadwal) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>
  if (!jadwal) return <p className="p-6 text-center text-gray-900 mt-10">Data tidak lengkap</p>

  const totalHarga = penumpangList.reduce((sum, p) => sum + (p.is_balita ? 0 : jadwal.harga), 0)
  const jamPotong = jadwal.jam_berangkat.substring(0, 5)

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden">
      
      <div className="flex-shrink-0 bg-white shadow-sm z-10 p-3 md:p-4">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Jual Tiket</h1>
              <p className="text-xs md:text-sm text-gray-600">Petugas: {profile?.nama}</p>
            </div>
            <button onClick={() => router.push(profile?.role === 'terminal_keberangkatan' ? '/dashboard/keberangkatan' : '/dashboard/loket-menu')} className="text-[10px] md:text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1 rounded border border-gray-200 mt-1">
              &larr; Kembali
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-2 md:p-3 rounded-lg">
            <div className="flex justify-between items-start">
              <div className="flex gap-2 md:gap-3">
                <div className="text-2xl md:text-3xl flex items-center justify-center">🚢</div>
                <div>
                  <div className="text-sm md:text-base font-bold text-gray-900">{jamPotong}</div>
                  <div className="text-[10px] md:text-xs font-bold text-blue-700">{jadwal.rute_asal} - {jadwal.rute_tujuan}</div>
                  <div className="text-[10px] md:text-xs text-gray-800 font-medium mt-0.5">{jadwal.nama_kapal}</div>
                  <div className="text-[9px] md:text-[10px] text-gray-600">Tgl {jadwal.tanggal}</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs md:text-sm font-bold text-blue-600">Rp {jadwal.harga.toLocaleString('id-ID')} / tiket</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {step === 'pilih-kursi' && (
        <>
          <div className="flex-1 overflow-hidden p-2 md:p-4 flex flex-col max-w-md mx-auto w-full">
            <div className="bg-white p-2 md:p-4 rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs md:text-sm font-bold text-gray-900">Pilih Kursi</h2>
                <div className="text-[9px] md:text-[10px] text-gray-500 space-x-2">
                  <span>🟢 Kosong</span><span className="text-blue-600">🔵 Dipilih</span><span className="text-gray-400">⚪ Terisi</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderDenahKursi()}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-sm z-10 p-3 md:p-4">
            <div className="max-w-md mx-auto">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs md:text-sm text-gray-800">Kursi dipilih: <b className="text-blue-600">{kursiDipilih.length}</b></p>
                {kursiDipilih.length > 0 && (
                  <p className="text-xs md:text-sm font-bold text-gray-900">Total: Rp {(jadwal.harga * kursiDipilih.length).toLocaleString('id-ID')}</p>
                )}
              </div>
              <button
                onClick={lanjutKeForm}
                disabled={kursiDipilih.length === 0}
                className={`w-full py-2.5 md:py-3 rounded-lg font-bold text-sm md:text-base transition-colors shadow-sm ${
                  kursiDipilih.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Lanjut Isi Data →
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'form' && (
        <form onSubmit={handleKlikQRIS} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 w-full">
            <div className="max-w-md mx-auto space-y-3">
              <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg text-center">
                <p className="text-xs md:text-sm text-blue-900"><b>{kursiDipilih.length}</b> kursi • Total <b>Rp {totalHarga.toLocaleString('id-ID')}</b></p>
              </div>

              {penumpangList.map((p, idx) => {
                const kursi = kursiList.find((k) => k.id === kursiDipilih[idx])
                return (
                  <div key={idx} className="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs md:text-sm font-bold text-gray-900">Penumpang #{idx + 1} — Kursi {kursi?.nomor_kursi || '?'}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1 text-[10px] md:text-xs font-medium text-gray-700">Nama Lengkap</label>
                        <input type="text" value={p.nama} onChange={(e) => updatePenumpang(idx, 'nama', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 md:py-2 text-xs md:text-sm text-gray-900" required />
                      </div>
                      <div>
                        <label className="block mb-1 text-[10px] md:text-xs font-medium text-gray-700">Status</label>
                        <label className="flex items-center gap-1.5 cursor-pointer mt-2">
                          <input type="checkbox" checked={p.is_balita} onChange={(e) => updatePenumpang(idx, 'is_balita', e.target.checked)} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                          <span className="text-[10px] md:text-xs font-bold text-orange-900">Balita (Tanpa NIK)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )
              })}

              <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-gray-200">
                <label className="block mb-1 text-[10px] md:text-xs font-medium text-gray-700">Nomor HP</label>
                <input type="tel" value={noHp} onChange={(e) => setNoHp(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 md:py-2 text-xs md:text-sm text-gray-900" placeholder="08xxxxxxxxxx" required />
              </div>

              {error && <p className="text-red-600 text-xs md:text-sm font-bold bg-red-50 p-2 rounded">{error}</p>}
            </div>
          </div>

          <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-sm z-10 p-3 md:p-4">
            <div className="max-w-md mx-auto space-y-2">
              <button type="submit" disabled={loadingSubmit} className="w-full bg-green-600 text-white py-2.5 md:py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-bold text-sm md:text-base shadow-sm transition-colors">
                {loadingSubmit ? 'Mengunci Kursi...' : `📱 Lanjut Bayar via QRIS`}
              </button>
              <button type="button" onClick={kembaliKeKursi} disabled={loadingSubmit} className="w-full text-gray-600 py-1.5 text-xs md:text-sm hover:underline font-medium">← Kembali Pilih Kursi</button>
            </div>
          </div>
        </form>
      )}

      {step === 'qris' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
            <div className="w-full max-w-md space-y-4 text-center">
              
              <div className="bg-red-50 border border-red-200 p-2 rounded-lg">
                <p className="text-xs font-bold text-red-600">⏰ Sisa Waktu Pembayaran</p>
                <p className="text-3xl font-bold text-red-700 font-mono">{formatWaktuSisa(waktuSisa)}</p>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 inline-block">
                <p className="text-sm font-bold text-gray-900 mb-1">Total Tagihan</p>
                <p className="text-3xl font-bold text-blue-700">Rp {totalHarga.toLocaleString('id-ID')}</p>
              </div>

              <div className="border-4 border-gray-900 p-2 inline-block rounded-lg bg-white">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=QRIS-SIMULASI-${Date.now()}`} 
                  alt="QRIS" 
                  className="w-48 h-48 md:w-56 md:h-56 object-contain" 
                />
              </div>

              <p className="text-xs text-gray-600">Scan QRIS di atas menggunakan m-banking atau e-wallet Anda.</p>
              <p className="text-[10px] text-gray-500 italic">(Ini adalah simulasi QRIS. Pembayaran tidak akan terpotong saldo Anda.)</p>

            </div>
          </div>

          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3 md:p-4 max-w-md mx-auto w-full space-y-2">
            <button onClick={handleKonfirmasiBayar} disabled={loadingSubmit} className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-bold text-sm md:text-base shadow-sm transition-colors">
              {loadingSubmit ? 'Memproses...' : '✓ Konfirmasi Pembayaran Sukses'}
            </button>
            <button onClick={handleTimeOut} disabled={loadingSubmit} className="w-full text-red-600 py-1.5 text-xs md:text-sm hover:underline font-medium">Batalkan & Lepas Kursi</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoketJualPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-900 mt-10">Memuat...</p>}>
      <LoketJualContent />
    </Suspense>
  )
}