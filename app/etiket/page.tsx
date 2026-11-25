'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession } from '@/lib/supabase'
import { ambilPesananPublik, type PesananPublik } from '@/lib/publikPesanan'
import QRCode from 'qrcode'
import { tangkapGambarTiket } from '@/lib/gambarTiket'
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
  // Setiap tiket dirender jadi GAMBAR UTUH lalu ditampilkan sebagai <img>.
  // Alasannya: menu Android "Buka di Browser / Simpan gambar / Berbagi gambar /
  // Pindai kode QR" hanya muncul saat yang ditekan lama adalah elemen <img>.
  // Dulu yang <img> cuma QR-nya, jadi nama/rute/harga tidak bisa disimpan.
  // Kuncinya kode_tiket supaya tiap tiket punya gambar sendiri.
  const [gambarTiket, setGambarTiket] = useState<Record<string, string>>({})
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

  // Semua kebutuhan gambar (tampilan tiket, Simpan PDF, Simpan Semua PDF)
  // mengambil dari SATU sumber: kartu tersembunyi selebar 350px. Kartu yang
  // tampil ikut aturan `md:` milik layar, sehingga di tablet hasil tangkapannya
  // bisa lebih lebar dan terpotong; dengan lebar tetap, hasil di HP, tablet,
  // dan laptop sama persis.
  //
  // Permintaan diantrekan karena halaman ini menangkap gambar otomatis saat
  // dibuka; tanpa antrean, aksi PDF yang ditekan berbarengan bisa memakai
  // wadah render yang sama dan menghasilkan gambar tiket yang salah.
  async function tangkapSatuTiket(t: TiketLengkap): Promise<string> {
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

  const antreanTangkap = useRef<Promise<unknown>>(Promise.resolve())

  function tangkapDariRender(t: TiketLengkap): Promise<string> {
    const tugas = antreanTangkap.current.then(() => tangkapSatuTiket(t))
    antreanTangkap.current = tugas.catch(() => undefined)
    return tugas
  }

  // Begitu data tiket siap, tiap tiket dirender jadi gambar. Selama proses
  // (biasanya < 1 detik) TiketCard HTML tetap tampil supaya layar tidak kosong.
  useEffect(() => {
    if (!detail || tiketList.length === 0) return

    let dibatalkan = false

    ;(async () => {
      for (const t of tiketList) {
        const kode = t.pesanan.kode_tiket
        if (dibatalkan) return

        try {
          const dataUrl = await tangkapDariRender(t)
          if (dibatalkan) return
          setGambarTiket((prev) => ({ ...prev, [kode]: dataUrl }))
        } catch (err) {
          // Gagal render bukan alasan menahan tiket: HTML tetap tampil dan
          // QR-nya masih bisa dipindai petugas.
          console.error('Gagal membuat gambar tiket', kode, err)
        }
      }
    })()

    return () => {
      dibatalkan = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, tiketList])

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
              {/* Cegah tekan-lama pada gambar ikut terbawa saat cetak: gambar
                  hanya untuk layar, versi HTML dipakai untuk printer thermal. */}
              {gambarTiket[t.pesanan.kode_tiket] && (
                <img
                  src={gambarTiket[t.pesanan.kode_tiket]}
                  alt={`E-Tiket ${t.pesanan.kode_tiket} - ${t.pesanan.nama_penumpang}`}
                  className="block w-full h-auto print:hidden"
                />
              )}

              {/* Selama gambar belum jadi (biasanya < 1 detik) HTML ini yang
                  tampil; setelah itu disembunyikan di layar tapi tetap dipakai
                  saat dicetak ke printer thermal. */}
              <div className={gambarTiket[t.pesanan.kode_tiket] ? 'hidden print:block' : ''}>
                <TiketCard tiket={t} detail={detail} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 print-hidden relative">
        <div className="max-w-md mx-auto px-3 py-2 md:px-4 md:py-3 space-y-2">
          {/* Tanpa tombol simpan/share: gambar tiket di atas sudah berupa
              <img>, jadi tekan & tahan langsung memakai menu bawaan HP
              (Simpan gambar / Berbagi gambar / Pindai kode QR). Cara ini sama
              di HP, tablet, dan laptop - tidak bergantung pada Web Share. */}
          <p className="bg-blue-600 text-white text-[11px] md:text-sm font-semibold text-center leading-snug rounded-md px-3 py-2">
            Tekan &amp; tahan gambar tiket di atas, lalu pilih
            Simpan gambar atau Berbagi gambar.
            {tiketList.length > 1 && ' Ulangi untuk tiket lainnya.'}
          </p>

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







