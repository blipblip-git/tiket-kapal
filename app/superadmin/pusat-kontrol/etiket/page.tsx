'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import QRCode from 'qrcode'
import { dataUrlKeFile, tangkapGambarTiket } from '@/lib/gambarTiket'
import { simpanTiketKePdf } from '@/lib/pdfTiket'
import { cetakTiketThermal } from '@/lib/thermalPrinter'

type Pesanan = {
  id: string
  nama_penumpang: string
  nik: string
  nomor_hp: string | null
  kode_tiket: string
  status: string
  jadwal_id: string
  kursi_id: string
  kanal: string
  petugas_jual: string | null
  metode_bayar?: string
  is_balita: boolean
  induk_id?: string | null
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
}

type TiketLengkap = {
  pesanan: Pesanan & {
    teks_loket_layar: string
    teks_loket_print: string
  }
  nomor_kursi: string
  qrUrl: string
  nama_balita: string[]
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

function EtiketSuperadminContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')
  const dari = searchParams.get('dari') || ''

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tiketList, setTiketList] = useState<TiketLengkap[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesanShare, setPesanShare] = useState('')
  // Browser tanpa Web Share berkas (browser bawaan Huawei, WebView WhatsApp)
  // tidak bisa mengirim gambar sama sekali. Daripada berhenti di pesan error,
  // gambar ditampilkan besar: "tekan & tahan -> Simpan gambar" pasti masuk
  // Galeri, lalu petugas bisa mengirimnya dari WhatsApp.
  const [pratinjau, setPratinjau] = useState<{ dataUrl: string; kodeTiket: string } | null>(null)
  const [activeTiketIndex, setActiveTiketIndex] = useState(0)

  const [renderData, setRenderData] = useState<TiketLengkap | null>(null)
  const renderRef = useRef<HTMLDivElement>(null)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      // HAPUS PENGECEKAN LOGIN PAKSA
      if (p) {
        setProfile(p)
      }
    }
    init()
  }, [router])

  // Escape menutup pratinjau gambar. Menu berbagi sudah tidak ada lagi:
  // tombol "Kirim E-Tiket" langsung membuka lembar berbagi Android/iOS.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPratinjau(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: p, error: errP } = await supabase
        .from('pesanan')
        .select('*')
        .in('id', pesananIds)

      if (errP || !p || p.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      const adultIds = (p as Pesanan[]).filter((x) => !x.is_balita).map((x) => x.id)
      let balitaTambahan: Pesanan[] = []
      if (adultIds.length > 0) {
        const { data: b } = await supabase
          .from('pesanan')
          .select('*')
          .in('induk_id', adultIds)
        balitaTambahan = (b || []) as Pesanan[]
      }

      const petaPesanan = new Map<string, Pesanan>()
      ;[...(p as Pesanan[]), ...balitaTambahan].forEach((x) => petaPesanan.set(x.id, x))

      const sorted = pesananIds
        .map((id) => petaPesanan.get(id))
        .filter((x): x is Pesanan => !!x)

      // Balita dengan induk_id menempel di tiket dewasa.
      // Baris BALITA- lama (tanpa induk_id) tetap dicetak sebagai tiket sendiri.
      const barisTiket = sorted.filter((x) => !x.is_balita || !x.induk_id)

      let detailJadwal: Detail | null = null
      if (barisTiket[0]) {
        const { data: j } = await supabase
          .from('jadwal')
          .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal_id')
          .eq('id', barisTiket[0].jadwal_id)
          .maybeSingle()

        if (j) {
          let namaKapal = '-'
          if (j.kapal_id) {
            const { data: kap } = await supabase
              .from('kapal')
              .select('nama')
              .eq('id', j.kapal_id)
              .maybeSingle()
            if (kap) namaKapal = kap.nama
          }
          detailJadwal = {
            rute_asal: j.rute_asal,
            rute_tujuan: j.rute_tujuan,
            tanggal: j.tanggal,
            jam_berangkat: j.jam_berangkat,
            harga: j.harga,
            nama_kapal: namaKapal
          }
          setDetail(detailJadwal)
        }
      }

      // Profil penjual hanya dibutuhkan untuk tiket OFFLINE. Tiket online
      // (pembeli umum) tidak boleh memicu pembacaan seluruh profil.
      const butuhProfilPenjual = barisTiket.some((x) => x.kanal !== 'online' && !!x.petugas_jual)
      let allProfiles: any[] | null = null
      if (butuhProfilPenjual) {
        const { data } = await supabase.from('profiles').select('email, nomor_hp, nama, lokasi, role')
        allProfiles = data
      }
      const { data: allKota } = await supabase.from('master_kota').select('nama_kota, singkatan')
      
      const kotaMap = new Map()
      allKota?.forEach(k => kotaMap.set(k.nama_kota, k.singkatan))

      const tiketLengkap: TiketLengkap[] = []
      for (const psn of barisTiket) {
        let nomorKursi = '-'
        if (psn.kursi_id) {
          const { data: k } = await supabase
            .from('kursi')
            .select('nomor_kursi')
            .eq('id', psn.kursi_id)
            .maybeSingle()
          if (k) nomorKursi = k.nomor_kursi
        }

        const { data: pmb } = await supabase
          .from('pembayaran')
          .select('metode')
          .eq('pesanan_id', psn.id)
          .maybeSingle()

        let teksLoketLayar = '-'
        let teksLoketPrint = '-'

        if (psn.kanal === 'online') {
          teksLoketLayar = 'Online'
          teksLoketPrint = 'Online'
        } else if (psn.petugas_jual) {
          const nomorHpMurni = psn.petugas_jual.includes('@') 
            ? psn.petugas_jual.split('@')[0] 
            : psn.petugas_jual;
          
          const bersihHp = nomorHpMurni.replace(/\D/g, '')

          const profilPenjual = allProfiles?.find(
            (prof: any) => {
              const profHp = prof.nomor_hp ? String(prof.nomor_hp).replace(/\D/g, '') : ''
              const profEmail = prof.email ? String(prof.email) : ''
              return profHp === bersihHp || profEmail === psn.petugas_jual || profEmail === nomorHpMurni
            }
          )
          
          if (profilPenjual) {
            let singkatanKota = ''
            if (profilPenjual.lokasi) {
              singkatanKota = kotaMap.get(profilPenjual.lokasi) || ''
            }

            const labelRole = profilPenjual.role === 'agen' ? 'Agen' : 'Petugas'
            const teksGabung = singkatanKota ? `${labelRole} : ${profilPenjual.nama} - ${singkatanKota}` : `${labelRole} : ${profilPenjual.nama}`
            
            teksLoketLayar = teksGabung
            teksLoketPrint = teksGabung

          } else {
            teksLoketLayar = `Petugas : ${nomorHpMurni}`
            teksLoketPrint = `Petugas : ${nomorHpMurni}`
          }
        }

        const qrDataUrl = await QRCode.toDataURL(psn.kode_tiket, {
          width: 200,
          margin: 1,
        })

        const namaBalita = sorted
          .filter((x) => x.is_balita && x.induk_id === psn.id)
          .map((x) => x.nama_penumpang)

        tiketLengkap.push({
          pesanan: { 
            ...psn, 
            metode_bayar: pmb?.metode || 'cash_loket',
            teks_loket_layar: teksLoketLayar,
            teks_loket_print: teksLoketPrint
          },
          nomor_kursi: nomorKursi,
          qrUrl: qrDataUrl,
          nama_balita: namaBalita,
        })
      }

      setTiketList(tiketLengkap)
      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // Semua simpan/bagikan memakai wadah render 350px yang sama dengan halaman
  // publik: hasilnya seragam di HP, tablet, dan laptop (tidak terpotong).
  async function tangkapDariRender(t: TiketLengkap): Promise<string> {
    setRenderData(t)

    await new Promise((r) => setTimeout(r, 80))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready

    const node = renderRef.current
    if (!node) throw new Error('Area render tiket belum siap.')

    await Promise.all(
      Array.from(node.querySelectorAll('img')).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((selesai) => {
              img.onload = () => selesai()
              img.onerror = () => selesai()
            })
      )
    )

    try {
      return await tangkapGambarTiket(node)
    } finally {
      setRenderData(null)
    }
  }

  async function simpanPdfSatu(pesananId: string, namaPenumpang: string) {
    const t = tiketList.find((x) => x.pesanan.id === pesananId)
    if (!t) return
    try {
      const dataUrl = await tangkapDariRender(t)
      const namaDepan = namaPenumpang.split(' ')[0] || 'Tiket'
      await simpanTiketKePdf(dataUrl, `${namaDepan}.pdf`)
      setPesanShare('PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
    } catch (err) {
      console.error('Gagal generate gambar:', err)
    }
  }

  async function simpanSemuaPdf() {
    for (let i = 0; i < tiketList.length; i++) {
      const t = tiketList[i]
      setPesanShare(`Memproses tiket ${i + 1} dari ${tiketList.length}...`)

      try {
        const dataUrl = await tangkapDariRender(t)
        const namaDepan = t.pesanan.nama_penumpang.split(' ')[0] || 'Tiket'
        await simpanTiketKePdf(dataUrl, `${namaDepan}.pdf`)
      } catch (err) {
        console.error(`Gagal memproses tiket ${i + 1}`, err)
      }

      await new Promise(r => setTimeout(r, 2000))
    }

    setRenderData(null)
    setPesanShare('Semua PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
  }

  async function shareKe(pesananId: string, kodeTiket: string) {
    setPesanShare('Menyiapkan e-tiket untuk dikirim...')

    const t = tiketList.find((x) => x.pesanan.id === pesananId)
    if (!t) return
    let dataUrl: string
    try {
      dataUrl = await tangkapDariRender(t)
    } catch {
      setPesanShare('Gagal membuat gambar tiket')
      return
    }

    try {
      // Jangan pakai fetch(dataUrl): diblokir CSP connect-src dan muncul sebagai
      // "Failed to fetch". dataUrlKeFile() men-decode base64 langsung.
      const file = dataUrlKeFile(dataUrl, `E-Tiket-${kodeTiket}.png`)

      const teksPesan = `E-Tiket Kapal Anda (Kode: ${kodeTiket}). Perlihatkan gambar ini ke petugas saat boarding.`

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'E-Tiket Kapal',
          text: teksPesan,
        })
        setPesanShare('E-Tiket sudah dikirim. Kalau belum, ulangi lalu pilih WhatsApp atau Telegram.')
        return
      }

      // Tanpa Web Share: tampilkan gambar supaya bisa disimpan lalu dikirim
      // manual. Jangan mengunduh diam-diam - hasilnya di folder Unduhan/File,
      // bukan Galeri, dan petugas mengira gambarnya sudah masuk Galeri.
      setPratinjau({ dataUrl, kodeTiket })
      setPesanShare('')
    } catch (err) {
      const e = err as { name?: string; message?: string }
      if (e.name === 'AbortError') {
        setPesanShare('Pengiriman dibatalkan.')
        return
      }
      console.error(err)
      setPratinjau({ dataUrl, kodeTiket })
      setPesanShare('')
    }
  }

  async function handleCetakThermal(t: TiketLengkap) {
    setPesanShare('Menghubungkan ke printer...')

    const result = await cetakTiketThermal({
      ...t.pesanan,
      jadwal: `${detail?.rute_asal} - ${detail?.rute_tujuan}`,
      kapal: detail?.nama_kapal || '-',
      jam: detail?.jam_berangkat || '00:00',
      tanggal: detail?.tanggal || '-',
      harga: t.pesanan.is_balita ? 0 : (detail?.harga || 0),
      kursi: t.nomor_kursi,
      nama_balita: t.nama_balita,
      teks_loket: t.pesanan.teks_loket_print 
    })
    setPesanShare(result.message)
  }

  function handleKembali() {
    const isOnline = tiketList[0]?.pesanan.kanal === 'online'
    if (isOnline) {
      router.replace('/')
      return
    }

    const sesi = getOperatorSession()
    
    if (sesi) {
      // Setelah selesai mencetak, petugas/agen langsung dibawa ke halaman
      // Jual Tiket agar tidak perlu kembali lewat dashboard lagi.
      if (sesi.role === 'agen') {
        router.replace('/agen/jual-tiket')
        return
      }
      if (sesi.role === 'terminal_keberangkatan') {
        router.replace('/cari-tiket')
        return
      }
      if (sesi.role === 'petugas_loket' || sesi.role === 'petugas_mobile') {
        router.replace('/dashboard/loket')
        return
      }
      if (sesi.role === 'admin_utama') {
        router.replace('/dashboard')
        return
      }
    }

    router.replace('/superadmin/pusat-kontrol')
  }

  if (loading) return <LayarMemuat teks="Menyiapkan e-tiket..." />
  if (error) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>
  if (tiketList.length === 0 || !detail) return <p className="p-6 text-center text-gray-900 mt-10">Data tidak lengkap</p>

  const isOnline = tiketList[0]?.pesanan.kanal === 'online'
  const t = tiketList[activeTiketIndex]

  const modeText = profile?.role === 'agen' ? 'Agen' : profile?.role === 'terminal_keberangkatan' ? 'Petugas' : 'Superadmin'

  const TiketCard = ({ tiket }: { tiket: TiketLengkap }) => {
    let labelMetode = 'Cash';
    if (tiket.pesanan.metode_bayar === 'simulasi_online' || tiket.pesanan.kanal === 'online') labelMetode = 'Qris';

    const hargaTampil = tiket.pesanan.is_balita ? 0 : (detail?.harga || 0)

    return (
      <div className="thermal-card p-3 md:p-6 text-gray-900 bg-white flex flex-col">
        <div className="text-center mb-2 md:mb-4 space-y-1">
          <p className="font-bold text-xs md:text-sm leading-tight break-words">
            {detail?.nama_kapal}
          </p>
          <p className="text-[11px] md:text-sm leading-tight break-words">
            {detail?.rute_asal} - {detail?.rute_tujuan}
          </p>
          <p className="font-bold text-xs md:text-sm thermal-title">{tiket.pesanan.kode_tiket}</p>
        </div>
        
        <div className="flex justify-center mb-2 md:mb-4">
          <img src={tiket.qrUrl} alt="QR Code" className="w-28 h-28 md:w-40 md:h-40 thermal-qr object-contain" />
        </div>
        
        <hr className="my-2 md:my-4 border-dashed border-gray-300" />
        
        <div className="text-[11px] md:text-sm space-y-1 md:space-y-2 thermal-text">
          <div className="flex justify-between">
            <span className="text-gray-500">Nama / Kursi</span>
            <span className="font-bold text-gray-900 text-right">
              {tiket.pesanan.nama_penumpang} / {tiket.nomor_kursi}
              {tiket.pesanan.is_balita && <span className="text-[9px] text-orange-600 ml-1">(Balita)</span>}
            </span>
          </div>
          {tiket.nama_balita.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Nama Balita</span>
              <span className="font-medium text-gray-900 text-right">{tiket.nama_balita.join(', ')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Tgl/Jam</span>
            <span className="font-medium text-gray-900">{detail?.tanggal}/{detail?.jam_berangkat.substring(0, 5)}</span>
          </div>
        </div>
        
        <hr className="my-2 md:my-4 border-dashed border-gray-300" />
        
        <div className="flex justify-between items-center thermal-text">
          <span className="font-bold text-gray-900 text-center w-full block text-xs md:text-sm">
            {tiket.pesanan.is_balita ? 'GRATIS (Balita)' : `${labelMetode} TOTAL: Rp ${hargaTampil.toLocaleString('id-ID')}`}
          </span>
        </div>
        
        <div className="mt-2 md:mt-4 text-center text-[9px] md:text-xs text-gray-400 border-t pt-1 md:pt-2 thermal-text">
          Perlihatkan e-tiket ke petugas<br/>
          {tiket.pesanan.teks_loket_layar}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex flex-col overflow-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes heartbeat-pink {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
        }
        .animate-heartbeat-pink { animation: heartbeat-pink 1.5s infinite; }

        @keyframes heartbeat-blue {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        .animate-heartbeat-blue { animation: heartbeat-blue 1.5s infinite; }

        @media print {
          @page { size: 58mm auto; margin: 0; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
          .print-hidden { display: none !important; }
          body * { visibility: hidden; }
          .thermal-wrapper, .thermal-wrapper * { visibility: visible; }
          .thermal-wrapper { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 5px; }
          .thermal-card { box-shadow: none !important; border: none !important; padding: 0 !important; }
        }
      `}} />

      <div className="flex-shrink-0 bg-white shadow-sm z-10 px-3 py-2 md:px-6 md:py-4 print-hidden">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button onClick={handleKembali} className="text-blue-600 text-[11px] md:text-sm hover:underline font-medium bg-gray-50 px-2 py-1.5 md:px-3 md:py-1.5 rounded border border-gray-200">
            ← Kembali
          </button>
          <div className="text-right">
            <h1 className="text-base md:text-xl font-bold text-gray-900">E-Tiket</h1>
            <p className="text-[10px] md:text-xs text-gray-600">Mode {isOnline ? 'Online' : modeText} | Total {tiketList.length} tiket</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-24 print:pb-0">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-3 md:space-y-6">
          
          {pesanShare && (
            <p className="text-[10px] md:text-sm text-center text-gray-900 mb-2 bg-yellow-100 p-2 rounded print-hidden">{pesanShare}</p>
          )}

          {tiketList.length > 1 && (
            <div className="flex overflow-x-auto gap-1 pb-1 mb-2 print-hidden">
              {tiketList.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTiketIndex(i)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs md:text-sm rounded-t-lg font-medium transition-colors ${
                    activeTiketIndex === i 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  Tiket #{i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md overflow-hidden print:shadow-none print:border-none border border-gray-200 flex flex-col thermal-wrapper">
            <div className="bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-sm font-medium print-hidden text-center">
              Tiket #{activeTiketIndex + 1} dari {tiketList.length}
            </div>

            <div className="bg-white">
              <TiketCard tiket={t} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 print-hidden relative">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-2">
          
          {!isOnline && (
            <button
              onClick={() => handleCetakThermal(t)}
              className="w-full bg-orange-500 text-white py-2 md:py-2.5 rounded-md hover:bg-orange-600 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
            >
              Cetak Thermal
            </button>
          )}

          {/* Simpan di kiri (utama), kirim di kanan - sama seperti halaman
              pembeli, supaya kasir tidak bingung urutannya. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => simpanPdfSatu(t.pesanan.id, t.pesanan.nama_penumpang)}
              className={`w-full bg-blue-600 text-white py-2 md:py-2.5 rounded-md hover:bg-blue-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors ${
                tiketList.length === 1 ? 'animate-heartbeat-blue' : ''
              }`}
            >
              Simpan PDF
            </button>

            <button
              onClick={() => shareKe(t.pesanan.id, t.pesanan.kode_tiket)}
              className="w-full bg-green-600 text-white py-2 md:py-2.5 rounded-md hover:bg-green-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
            >
              Kirim E-Tiket
            </button>
          </div>

          <p className="text-[9px] md:text-[11px] text-gray-500 text-center leading-snug">
            Simpan PDF &rarr; masuk ke folder Unduhan/File.
            Kirim E-Tiket &rarr; pilih WhatsApp atau Telegram.
          </p>

          {tiketList.length > 1 && (
            <button
              onClick={simpanSemuaPdf}
              className="w-full bg-pink-500 text-white py-2 md:py-2.5 rounded-md hover:bg-pink-600 text-[11px] md:text-sm font-bold shadow-sm transition-colors animate-heartbeat-pink"
            >
              Simpan Semua PDF ({tiketList.length})
            </button>
          )}

        </div>
      </div>

      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {renderData && (
          <div 
            ref={renderRef}
            className="bg-white" 
            style={{ width: '350px' }}
          >
            <TiketCard tiket={renderData} />
          </div>
        )}
      </div>

      {pratinjau && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-3 overflow-y-auto print-hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg p-3 w-full max-w-md mt-6">
            <p className="text-[12px] text-gray-900 font-medium text-center leading-snug">
              Kirim lewat WhatsApp / Telegram: tekan &amp; tahan gambar di bawah, pilih
              Simpan gambar, lalu kirim dari Galeri.
            </p>

            <img
              src={pratinjau.dataUrl}
              alt={`E-Tiket ${pratinjau.kodeTiket}`}
              className="w-full h-auto mt-2 border border-gray-200 rounded"
            />

            <div className="grid grid-cols-2 gap-2 mt-3">
              <a
                href={pratinjau.dataUrl}
                download={`E-Tiket-${pratinjau.kodeTiket}.png`}
                className="bg-blue-600 text-white text-center py-2 rounded-md text-xs font-bold"
              >
                Unduh Gambar
              </a>
              <button
                onClick={() => setPratinjau(null)}
                className="bg-gray-200 text-gray-800 py-2 rounded-md text-xs font-bold"
              >
                Tutup
              </button>
            </div>

            <p className="text-[10px] text-gray-500 text-center mt-2 leading-snug">
              Tekan &amp; tahan gambar = cara paling cepat menyimpan ke Galeri; tombol Unduh
              Gambar menyimpan ke folder Unduhan/File.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}

export default function EtiketSuperadminPage() {
  return (
    <Suspense fallback={<LayarMemuat teks="Menyiapkan e-tiket..." />}>
      <EtiketSuperadminContent />
    </Suspense>
  )
}