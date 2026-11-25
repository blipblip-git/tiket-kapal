'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'
import { ambilPesananPublik, type PesananPublik } from '@/lib/publikPesanan'
import QRCode from 'qrcode'
import { dataUrlKeFile, tangkapGambarTiket } from '@/lib/gambarTiket'
import { simpanTiketKePdf } from '@/lib/pdfTiket'

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
}

type TiketLengkap = {
  pesanan: PesananPublik
  nomor_kursi: string
  qrUrl: string
  nama_balita: string[]
}

type BarisTiket = {
  induk: PesananPublik
  anak: PesananPublik[]
}

// Logo WhatsApp & Telegram digambar sendiri (SVG inline) supaya tidak perlu
// menambah paket ikon - bundle tetap kecil. Warna aslinya dipertahankan agar
// pembeli langsung tahu tombol mana menuju aplikasi mana.
function IkonWhatsApp({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        d="M12 4.7c-1.9 0-3.7.8-5 2.1a7.2 7.2 0 00-2.1 5.1c0 1.2.3 2.4.9 3.5L4.7 19l3.8-1a7.2 7.2 0 003.5.9c4 0 7.2-3.2 7.2-7.1 0-4-3.2-7.1-7.2-7.1z"
        fill="#fff"
      />
      <path
        d="M10.3 8.3c.2 0 .4.1.5.3l.4.9c.1.2.1.4-.1.5l-.4.4c-.1.1-.2.2-.1.4.3.5.7 1 1.2 1.4.5.4 1 .7 1.4.9.2.1.3 0 .4-.1l.4-.4c.1-.2.3-.2.5-.1l.9.4c.2.1.3.3.3.5v.6c0 .3-.1.6-.4.8-.3.2-.7.3-1.1.3-.8 0-2-.4-3.2-1.5-1.1-1.1-1.6-2.2-1.7-2.9-.1-.5 0-1 .3-1.4l.5-.6c.1-.1.2-.2.4-.2z"
        fill="#25D366"
      />
    </svg>
  )
}

function IkonTelegram({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="M18.4 7.1 5.9 11.9c-.9.3-.9.9-.1 1.1l3 .9 1.1 3.4c.1.4.3.5.6.5.3 0 .5-.1.7-.3l1.6-1.5 3 2.2c.5.3 1 .1 1.1-.5l1.9-9.1c.2-.7-.3-1-.9-.5z"
        fill="#fff"
      />
    </svg>
  )
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

/**
 * Satu baris tiket = satu penumpang dewasa + balita yang menempel padanya.
 * Baris balita tidak dibuatkan boarding pass terpisah.
 */
function susunBarisTiket(data: PesananPublik[]): BarisTiket[] {
  const dewasa = data.filter((x) => !x.is_balita)
  const balita = data.filter((x) => x.is_balita)
  const terpakai = new Set<string>()
  // Tanpa induk_id/grup (RPC lama), balita hanya bisa dipastikan milik
  // orang tuanya kalau di URL memang hanya ada satu tiket dewasa.
  const hanyaSatuDewasa = dewasa.length === 1

  const baris: BarisTiket[] = dewasa.map((induk) => {
    const anak = balita.filter((b) => {
      if (terpakai.has(b.id)) return false
      if (b.induk_id) return b.induk_id === induk.id
      // Data lama: induk_id kosong. Tempelkan ke dewasa pertama di grup yang sama.
      if (b.grup_transaksi_id) {
        const dewasaPertama = dewasa.find(
          (d) => d.grup_transaksi_id && d.grup_transaksi_id === b.grup_transaksi_id
        )
        return dewasaPertama?.id === induk.id
      }
      return hanyaSatuDewasa
    })
    anak.forEach((b) => terpakai.add(b.id))
    return { induk, anak }
  })

  // Balita tanpa orang tua (data lama) tetap dicetak sebagai tiket sendiri.
  balita.filter((b) => !terpakai.has(b.id)).forEach((b) => baris.push({ induk: b, anak: [] }))
  return baris
}

function TiketCard({ tiket, detail }: { tiket: TiketLengkap; detail: Detail }) {
  const hargaTampil = tiket.pesanan.is_balita ? 0 : detail.harga

  return (
    <div className="thermal-card p-3 md:p-6 text-gray-900 bg-white flex flex-col">
      <div className="text-center mb-2 md:mb-4 space-y-1">
        <p className="font-bold text-xs md:text-sm leading-tight break-words">
          {detail.nama_kapal}
        </p>
        <p className="text-[11px] md:text-sm leading-tight break-words">
          {detail.rute_asal} - {detail.rute_tujuan}
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
            <span className="text-gray-500">Balita</span>
            <span className="font-medium text-gray-900 text-right">{tiket.nama_balita.join(', ')}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Tgl/Jam</span>
          <span className="font-medium text-gray-900">{detail.tanggal}/{detail.jam_berangkat.substring(0, 5)}</span>
        </div>
      </div>

      <hr className="my-2 md:my-4 border-dashed border-gray-300" />

      <div className="flex justify-between items-center thermal-text">
        <span className="font-bold text-gray-900 text-center w-full block text-xs md:text-sm">
          {tiket.pesanan.is_balita ? 'GRATIS (Balita)' : `Qris TOTAL: Rp ${hargaTampil.toLocaleString('id-ID')}`}
        </span>
      </div>

      <div className="mt-2 md:mt-4 text-center text-[9px] md:text-xs text-gray-400 border-t pt-1 md:pt-2 thermal-text">
        Perlihatkan e-tiket ke petugas<br/>
        Pembelian Online
      </div>
    </div>
  )
}

function EtiketPublikContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')
  const dari = searchParams.get('dari')

  const [tiketList, setTiketList] = useState<TiketLengkap[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesanShare, setPesanShare] = useState('')
  // Ditampilkan kalau browser tidak punya Web Share (mis. browser bawaan
  // Huawei): gambar diperlihatkan besar supaya bisa "tekan & tahan -> Simpan
  // gambar", satu-satunya cara yang pasti masuk ke Galeri.
  // `mode` menentukan teksnya: 'kirim' (tujuan WhatsApp/Telegram) atau
  // 'simpan' (tujuan Galeri), supaya pembeli tidak salah paham.
  const [pratinjau, setPratinjau] = useState<{
    dataUrl: string
    kodeTiket: string
    mode: 'kirim' | 'simpan'
  } | null>(null)
  const [activeTiketIndex, setActiveTiketIndex] = useState(0)

  const [renderData, setRenderData] = useState<TiketLengkap | null>(null)
  const renderRef = useRef<HTMLDivElement>(null)

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  async function fetchData() {
    try {
      const { data, error: errP } = await ambilPesananPublik(pesananIds)
      if (errP) throw new Error(errP)

      if (!data || data.length === 0) {
        setError('Tiket tidak ditemukan atau waktu pembayaran sudah habis.')
        return
      }

      if (data.some((x) => x.status !== 'paid')) {
        router.replace(`/pembayaran?pesanan=${pesananIds.join(',')}`)
        return
      }

      const baris = susunBarisTiket(data)
      if (baris.length === 0) {
        setError('Tiket tidak ditemukan.')
        return
      }

      const { data: j } = await supabase
        .from('jadwal')
        .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal_id')
        .eq('id', baris[0].induk.jadwal_id)
        .maybeSingle()

      let namaKapal = '-'
      if (j?.kapal_id) {
        const { data: kap } = await supabase
          .from('kapal')
          .select('nama')
          .eq('id', j.kapal_id)
          .maybeSingle()
        if (kap?.nama) namaKapal = kap.nama
      }

      const ruteAsal = j?.rute_asal || '-'
      const ruteTujuan = j?.rute_tujuan || '-'

      setDetail({
        rute_asal: ruteAsal,
        rute_tujuan: ruteTujuan,
        tanggal: j?.tanggal || '-',
        jam_berangkat: j?.jam_berangkat || '',
        harga: Number(j?.harga || 0),
        nama_kapal: namaKapal
      })

      const tiketLengkap: TiketLengkap[] = []

      for (const { induk, anak } of baris) {
        let nomorKursi = '-'
        if (induk.kursi_id) {
          const { data: k } = await supabase
            .from('kursi')
            .select('nomor_kursi')
            .eq('id', induk.kursi_id)
            .maybeSingle()
          if (k?.nomor_kursi) nomorKursi = k.nomor_kursi
        }

        const qrUrl = await QRCode.toDataURL(induk.kode_tiket, {
          width: 200,
          margin: 1
        })

        tiketLengkap.push({
          pesanan: induk,
          nomor_kursi: nomorKursi,
          qrUrl,
          nama_balita: anak.map((a) => a.nama_penumpang)
        })
      }

      setTiketList(tiketLengkap)
    } catch (err) {
      console.error(err)
      const pesan = err instanceof Error ? err.message : 'Kesalahan tidak diketahui'
      setError('Gagal memuat e-tiket: ' + pesan)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let dibatalkan = false

    async function init() {
      // Staf yang membuka e-tiket (termasuk alur loket/agen) tetap memakai
      // halaman pusat-kontrol yang punya cetak thermal & data penjual.
      // Pembeli online TIDAK punya sesi, jadi tidak boleh ditendang ke /superadmin.
      const sesiLokal = getOperatorSession()
      const { data: { session } } = await supabase.auth.getSession()

      if (dibatalkan) return

      if (dari || sesiLokal || session) {
        const kanalParam = dari ? `&dari=${encodeURIComponent(dari)}` : ''
        router.replace(`/superadmin/pusat-kontrol/etiket?pesanan=${pesananParam || ''}${kanalParam}`)
        return
      }

      if (!pesananParam || pesananIds.length === 0) {
        router.replace('/')
        return
      }

      await fetchData()
    }

    init()
    return () => {
      dibatalkan = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Semua tombol simpan/bagikan mengambil gambar dari SATU sumber: kartu
  // tersembunyi selebar 350px (wadah yang sama dengan "Simpan Semua Tiket").
  // Kartu yang tampil ikut aturan `md:` milik layar, sehingga di tablet hasil
  // tangkapannya bisa lebih lebar dan terpotong; dengan lebar tetap, hasil di
  // HP, tablet, dan laptop sama persis.
  async function tangkapDariRender(t: TiketLengkap): Promise<string> {
    setRenderData(t)

    // Biarkan React memasang wadah + QR (data URL) ter-decode lebih dulu.
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

  async function simpanPdfSatu(t: TiketLengkap) {
    setPesanShare('Menyiapkan PDF tiket...')
    try {
      const dataUrl = await tangkapDariRender(t)
      const namaDepan = t.pesanan.nama_penumpang.split(' ')[0] || 'Tiket'
      await simpanTiketKePdf(dataUrl, `${namaDepan}-${t.pesanan.kode_tiket}.pdf`)
      setPesanShare('PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
    } catch (err) {
      console.error('Gagal membuat PDF:', err)
      setPesanShare('Gagal membuat PDF tiket.')
    }
  }

  async function simpanSemuaPdf() {
    for (let i = 0; i < tiketList.length; i++) {
      const t = tiketList[i]
      setPesanShare(`Memproses tiket ${i + 1} dari ${tiketList.length}...`)

      try {
        const dataUrl = await tangkapDariRender(t)
        const namaDepan = t.pesanan.nama_penumpang.split(' ')[0] || 'Tiket'
        await simpanTiketKePdf(dataUrl, `${namaDepan}-${t.pesanan.kode_tiket}.pdf`)
      } catch (err) {
        console.error(`Gagal memproses tiket ${i + 1}`, err)
      }

      await new Promise((r) => setTimeout(r, 2000))
    }

    setRenderData(null)
    setPesanShare('Semua PDF berhasil diunduh. Silakan cek folder Unduhan/File di HP Anda.')
  }

  // Kirim E-Tiket: lembar berbagi Android/iOS menampilkan WhatsApp, Telegram,
  // dan aplikasi lain. Ini satu-satunya jalan mengirim GAMBAR dari browser -
  // tautan wa.me hanya bisa membawa teks, bukan gambar.
  async function kirimSatu(t: TiketLengkap) {
    setPesanShare('Menyiapkan e-tiket untuk dikirim...')

    let dataUrl: string
    try {
      dataUrl = await tangkapDariRender(t)
    } catch {
      setPesanShare('Gagal membuat gambar tiket.')
      return
    }

    const kodeTiket = t.pesanan.kode_tiket

    try {
      const file = dataUrlKeFile(dataUrl, `E-Tiket-${kodeTiket}.png`)
      const teksPesan = `E-Tiket Kapal Anda (Kode: ${kodeTiket}). Perlihatkan gambar ini ke petugas saat boarding.`

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'E-Tiket Kapal',
          text: teksPesan
        })
        setPesanShare('E-Tiket sudah dikirim. Kalau belum, ulangi lalu pilih WhatsApp atau Telegram.')
        return
      }

      // Tanpa Web Share (WebView WhatsApp / browser bawaan Huawei): beri jalan
      // yang pasti bisa dipakai - simpan gambar, lalu kirim dari WhatsApp.
      setPratinjau({ dataUrl, kodeTiket, mode: 'kirim' })
      setPesanShare('')
    } catch (err) {
      const e = err as { name?: string; message?: string }
      if (e.name === 'AbortError') {
        setPesanShare('Pengiriman dibatalkan.')
        return
      }
      console.error(err)
      setPratinjau({ dataUrl, kodeTiket, mode: 'kirim' })
      setPesanShare('')
    }
  }

  // Kirim beberapa tiket sekaligus: semua gambar dimasukkan ke SATU lembar
  // berbagi, jadi pembeli tinggal memilih WhatsApp/Telegram sekali saja.
  async function kirimSemua() {
    const files: File[] = []
    let dataUrlPertama = ''

    for (let i = 0; i < tiketList.length; i++) {
      const t = tiketList[i]
      setPesanShare(`Menyiapkan tiket ${i + 1} dari ${tiketList.length}...`)

      try {
        const dataUrl = await tangkapDariRender(t)
        if (!dataUrlPertama) dataUrlPertama = dataUrl
        files.push(dataUrlKeFile(dataUrl, `E-Tiket-${t.pesanan.kode_tiket}.png`))
      } catch (err) {
        console.error(`Gagal menyiapkan tiket ${i + 1}`, err)
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    if (files.length === 0) {
      setPesanShare('Gagal membuat gambar tiket.')
      return
    }

    const kodePertama = tiketList[0].pesanan.kode_tiket

    try {
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: 'E-Tiket Kapal',
          text: `E-Tiket Kapal (${files.length} tiket). Perlihatkan gambar ini ke petugas saat boarding.`
        })
        setPesanShare('E-Tiket sudah dikirim. Kalau belum, ulangi lalu pilih WhatsApp atau Telegram.')
        return
      }

      setPratinjau({ dataUrl: dataUrlPertama, kodeTiket: kodePertama, mode: 'simpan' })
      setPesanShare('')
    } catch (err) {
      const e = err as { name?: string }
      if (e.name === 'AbortError') {
        setPesanShare('Pengiriman dibatalkan.')
        return
      }
      console.error(err)
      setPratinjau({ dataUrl: dataUrlPertama, kodeTiket: kodePertama, mode: 'simpan' })
      setPesanShare('')
    }
  }

  // Simpan ke Galeri. Kenapa BUKAN lembar berbagi: pembeli mengeluh tombol
  // "Simpan" malah menyuruh memilih aplikasi medsos. Browser juga tidak bisa
  // menulis ke Galeri tanpa lembar berbagi (`<a download>` selalu mendarat di
  // folder Unduhan/File). Jadi tombol ini langsung membuka gambar ukuran
  // penuh: satu "tekan & tahan -> Simpan gambar" dijamin masuk Galeri di
  // semua Android/iPhone, termasuk browser bawaan Huawei.
  async function simpanKeGaleri(t: TiketLengkap) {
    setPesanShare('Menyiapkan gambar tiket...')

    try {
      const dataUrl = await tangkapDariRender(t)
      setPratinjau({ dataUrl, kodeTiket: t.pesanan.kode_tiket, mode: 'simpan' })
      setPesanShare('')
    } catch {
      setPesanShare('Gagal membuat gambar tiket.')
    }
  }

  function handleKembali() {
    router.replace('/')
  }

  if (loading) return <LayarMemuat teks="Memuat e-tiket Anda..." />

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-center text-red-600 font-medium mb-4">{error}</p>
        <button
          onClick={handleKembali}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-700"
        >
          Kembali ke Beranda
        </button>
      </div>
    )
  }

  if (tiketList.length === 0 || !detail) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-center text-gray-700 font-medium mb-4">Data tiket tidak lengkap.</p>
        <button
          onClick={handleKembali}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-700"
        >
          Kembali ke Beranda
        </button>
      </div>
    )
  }

  const t = tiketList[Math.min(activeTiketIndex, tiketList.length - 1)]

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

        @keyframes heartbeat-green {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }
        .animate-heartbeat-green { animation: heartbeat-green 1.5s infinite; }

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
          <button
            onClick={handleKembali}
            className="text-blue-600 text-[11px] md:text-sm hover:underline font-medium bg-gray-50 px-2 py-1.5 md:px-3 md:py-1.5 rounded border border-gray-200"
          >
            ← Halaman Utama
          </button>
          <div className="text-right">
            <h1 className="text-base md:text-xl font-bold text-gray-900">E-Tiket</h1>
            <p className="text-[10px] md:text-xs text-gray-600">
              Online • Total {tiketList.length} tiket
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-24 print:pb-0">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-3 md:space-y-6">
          {pesanShare && (
            <p className="text-[10px] md:text-sm text-center text-gray-900 mb-2 bg-yellow-100 p-2 rounded print-hidden">
              {pesanShare}
            </p>
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
              <TiketCard tiket={t} detail={detail} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 print-hidden relative">
        <div className="max-w-md mx-auto p-3 md:p-4 space-y-2">
          {/* Simpan di kiri sebagai aksi utama: hasilnya langsung masuk Galeri
              dan itu yang paling sering dipakai pembeli. Kirim/share di kanan,
              lengkap dengan logo WhatsApp & Telegram supaya tujuan tombolnya
              langsung terbaca (logo besar = tidak perlu baca tulisan). */}
          <div className="flex gap-2 items-stretch">
            <button
              onClick={() => simpanKeGaleri(t)}
              className={`flex-1 bg-green-600 text-white py-2 md:py-2.5 rounded-md hover:bg-green-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors ${
                tiketList.length === 1 ? 'animate-heartbeat-green' : ''
              }`}
            >
              Simpan ke Galeri
            </button>

            <button
              onClick={() => kirimSatu(t)}
              aria-label="Kirim e-tiket lewat WhatsApp"
              title="Kirim e-tiket lewat WhatsApp"
              className="flex flex-col items-center justify-center w-12 md:w-16 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 shadow-sm transition-colors"
            >
              <IkonWhatsApp className="h-[18px] w-[18px] md:h-5 md:w-5" />
              <span className="text-[8px] md:text-[10px] font-bold text-gray-700 leading-none mt-0.5">WA</span>
            </button>

            <button
              onClick={() => kirimSatu(t)}
              aria-label="Kirim e-tiket lewat Telegram"
              title="Kirim e-tiket lewat Telegram"
              className="flex flex-col items-center justify-center w-[58px] md:w-20 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 shadow-sm transition-colors"
            >
              <IkonTelegram className="h-[18px] w-[18px] md:h-5 md:w-5" />
              <span className="text-[8px] md:text-[10px] font-bold text-gray-700 leading-none mt-0.5">Telegram</span>
            </button>
          </div>

          <p className="text-[9px] md:text-[11px] text-gray-500 text-center leading-snug">
            Simpan ke Galeri &rarr; tekan &amp; tahan gambar, lalu pilih Simpan gambar.
            Kirim &rarr; ketuk logo WhatsApp atau Telegram.
          </p>

          {tiketList.length > 1 && (
            <button
              onClick={kirimSemua}
              className="w-full bg-green-600 text-white py-2 md:py-2.5 rounded-md hover:bg-green-700 text-[11px] md:text-sm font-bold shadow-sm transition-colors animate-heartbeat-pink"
            >
              Kirim Semua E-Tiket ({tiketList.length})
            </button>
          )}

          {/* PDF disembunyikan di HP: hasilnya selalu mendarat di folder
              Unduhan/File (bukan Galeri) dan susah dibuka pembeli. Di
              tablet/laptop PDF tetap ada karena di sanalah ia berguna. */}
          <div className="hidden md:grid grid-cols-2 gap-2">
            <button
              onClick={() => simpanPdfSatu(t)}
              className="bg-white text-gray-700 border border-gray-300 py-2 md:py-2.5 rounded-md hover:bg-gray-50 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
            >
              Simpan PDF
            </button>

            {tiketList.length > 1 && (
              <button
                onClick={simpanSemuaPdf}
                className="bg-white text-gray-700 border border-gray-300 py-2 md:py-2.5 rounded-md hover:bg-gray-50 text-[11px] md:text-sm font-bold shadow-sm transition-colors"
              >
                Simpan Semua PDF ({tiketList.length})
              </button>
            )}
          </div>

          <p className="hidden md:block text-[10px] text-gray-500 text-center leading-snug">
            Simpan PDF tersimpan di folder Unduhan/File.
          </p>
        </div>
      </div>

      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {renderData && (
          <div ref={renderRef} className="bg-white" style={{ width: '350px' }}>
            <TiketCard tiket={renderData} detail={detail} />
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
              {pratinjau.mode === 'kirim'
                ? 'Kirim lewat WhatsApp / Telegram: tekan & tahan gambar di bawah, pilih Simpan gambar, lalu kirim dari Galeri.'
                : 'Tekan & tahan gambar di bawah, lalu pilih Simpan gambar supaya masuk Galeri.'}
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

export default function EtiketPage() {
  return (
    <Suspense fallback={<LayarMemuat teks="Memuat e-tiket..." />}>
      <EtiketPublikContent />
    </Suspense>
  )
}







