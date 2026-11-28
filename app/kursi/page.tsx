'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, bersihkanPesananExpired } from '@/lib/supabase'
import { nomorKursiTerpakai } from '@/lib/segmen'
import { fetchPublik } from '@/lib/publikFetch'
import { formatTanggalPanjang } from '@/lib/hari'
import Link from 'next/link'

type Kursi = {
  id: string
  nomor_kursi: string
  status: string
  waktu_hold: string | null
}

// Jam berangkat diseragamkan jadi HH:MM (data lama bisa "8.00" atau "08:00:00").
function jamTampil(jam: string): string {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(String(jam || '').trim())
  if (!cocok) return String(jam || '').slice(0, 5)
  return `${cocok[1].padStart(2, '0')}:${cocok[2]}`
}

function KursiContent() {
  const searchParams = useSearchParams()
  const jadwalId = searchParams.get('jadwal')

  const [kursi, setKursi] = useState<Kursi[]>([])
  const [layout, setLayout] = useState<string>('tanpa_layout')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dipilih, setDipilih] = useState<string[]>([])
  // Ringkasan jadwal untuk header: pembeli harus yakin rute, jam, dan kapal
  // yang dibuka sudah benar sebelum memilih kursi.
  const [info, setInfo] = useState<{
    asal: string
    tujuan: string
    jam: string
    kapal: string
    tanggal: string
  } | null>(null)

  const fetchKursi = async (info?: {
    kapal_id?: string
    tanggal?: string
    jam_berangkat?: string
    rute_asal?: string
    rute_tujuan?: string
  }) => {
    if (!jadwalId) return 0

    const { data, error: errK } = await supabase
      .from('kursi')
      .select('*')
      .eq('jadwal_id', jadwalId)

    if (errK) {
      setError(errK.message)
      setLoading(false)
      return 0
    }

    // === STATUS KURSI PER POTONGAN JALAN (SEGMEN) ===
    // Kalau tabel kursi_pakai sudah ada: kursi yang terkunci hanya kursi yang
    // intervalnya beririsan dengan rute ini. Kursi yang dipakai penumpang rute
    // lain (mis. lanjutan Tg Batu → Berau) tetap hijau.
    let terpakai: Set<string> | null = null
    if (info?.kapal_id && info?.tanggal && info?.jam_berangkat) {
      const hasil = await nomorKursiTerpakai(supabase, {
        kapal_id: info.kapal_id,
        tanggal: info.tanggal,
        jam_berangkat: info.jam_berangkat,
        rute_asal: info.rute_asal || '',
        rute_tujuan: info.rute_tujuan || '',
      })
      if (hasil.aktif) terpakai = hasil.nomor
    }

    // === FILTER UNIQUE BERDASARKAN NOMOR KURSI ===
    const uniqueMap = new Map<string, Kursi>()
    ;(data || []).forEach((k) => {
      if (!uniqueMap.has(k.nomor_kursi)) {
        uniqueMap.set(k.nomor_kursi, k)
      }
    })
    const uniqueKursi = Array.from(uniqueMap.values())

    const sortedKursi = uniqueKursi
      .map((k) => ({
        ...k,
        status:
          terpakai !== null
            ? terpakai.has(String(k.nomor_kursi))
              ? 'terisi'
              : 'kosong'
            : k.status,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.nomor_kursi, 10)
        const numB = parseInt(b.nomor_kursi, 10)
        return numA - numB
      })

    setKursi(sortedKursi)
    return (data || []).length
  }

  useEffect(() => {
    async function init() {
      if (!jadwalId) {
        setError('Jadwal tidak ditemukan di URL')
        setLoading(false)
        return
      }

      await bersihkanPesananExpired()

      const { data: j } = await supabase
        .from('jadwal')
        .select('kapal_id, tanggal, jam_berangkat, rute_asal, rute_tujuan')
        .eq('id', jadwalId)
        .single()

      // Info jadwal dipakai dua kali (muat kursi + siapkan kursi), jadi disusun
      // sekali dengan tipe yang diharapkan fetchKursi.
      const infoJadwal = j
        ? {
            kapal_id: j.kapal_id || undefined,
            tanggal: j.tanggal || undefined,
            jam_berangkat: j.jam_berangkat || undefined,
            rute_asal: j.rute_asal || undefined,
            rute_tujuan: j.rute_tujuan || undefined
          }
        : undefined

      // Kalau pembeli masuk langsung dari beranda (tanpa lewat /pilih-jadwal),
      // jadwal ini bisa belum punya baris kursi. Minta server menyiapkannya,
      // lalu muat ulang — supaya tautan langsung tetap berfungsi.
      let jumlahKursi = await fetchKursi(infoJadwal)
      if (jumlahKursi === 0 && j) {
        try {
          await fetchPublik('/api/publik/siapkan-jadwal', {
            method: 'POST',
            body: JSON.stringify({
              tanggal: j.tanggal,
              rute_asal: j.rute_asal,
              rute_tujuan: j.rute_tujuan
            })
          })
          jumlahKursi = await fetchKursi(infoJadwal)
          if (jumlahKursi === 0) console.warn('Kursi tetap kosong untuk jadwal', jadwalId)
        } catch (err) {
          console.error('Gagal menyiapkan kursi:', err)
        }
      }

      let namaKapal = ''
      if (j?.kapal_id) {
        const { data: kap } = await supabase
          .from('kapal')
          .select('nama, layout_kursi')
          .eq('id', j.kapal_id)
          .single()

        if (kap?.layout_kursi) setLayout(kap.layout_kursi)
        namaKapal = kap?.nama || ''
      }

      // Info rute/jam/kapal untuk header. Tanpa ini pembeli ragu apakah rute
      // yang dipilih sudah benar, karena halaman kursi hanya menampilkan denah.
      if (j) {
        setInfo({
          asal: j.rute_asal || '',
          tujuan: j.rute_tujuan || '',
          jam: j.jam_berangkat || '',
          kapal: namaKapal,
          tanggal: j.tanggal || ''
        })
      }

      setLoading(false)
    }

    init()
  }, [jadwalId])

  const toggleKursi = (id: string) => {
    if (dipilih.includes(id)) {
      setDipilih(dipilih.filter((k) => k !== id))
    } else {
      if (dipilih.length >= 30) {
        alert('Maksimal 30 kursi per pembelian')
        return
      }
      setDipilih([...dipilih, id])
    }
  }

  function renderKursiButton(k: Kursi) {
    const terisi = k.status === 'terisi' || k.status === 'hold'
    const terpilih = dipilih.includes(k.id)

    return (
      <button
        key={k.id}
        disabled={terisi && !terpilih}
        onClick={() => toggleKursi(k.id)}
        className={
          'w-full h-full flex items-center justify-center rounded md:rounded-md font-medium text-[10px] md:text-sm transition-colors ' +
          (terisi && !terpilih
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : terpilih
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-300')
        }
      >
        {k.nomor_kursi}
      </button>
    )
  }

  function renderLayout23() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 5) {
      baris.push(kursi.slice(i, i + 5))
    }

    return (
      <div className="flex flex-col h-full justify-between gap-1 md:gap-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-stretch gap-2 md:gap-4 flex-1">
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-4 md:w-8" />
            <div className="grid grid-cols-3 gap-1 md:gap-2 flex-1 max-w-[55%]">
              {row.slice(2, 5).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayout22() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 4) {
      baris.push(kursi.slice(i, i + 4))
    }

    return (
      <div className="flex flex-col h-full justify-between gap-1 md:gap-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-stretch gap-2 md:gap-4 flex-1">
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(0, 2).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-4 md:w-8" />
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(2, 4).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayout32() {
    const baris: Kursi[][] = []
    for (let i = 0; i < kursi.length; i += 5) {
      baris.push(kursi.slice(i, i + 5))
    }

    return (
      <div className="flex flex-col h-full justify-between gap-1 md:gap-2">
        {baris.map((row, idx) => (
          <div key={idx} className="flex justify-center items-stretch gap-2 md:gap-4 flex-1">
            <div className="grid grid-cols-3 gap-1 md:gap-2 flex-1 max-w-[55%]">
              {row.slice(0, 3).map((k) => renderKursiButton(k))}
            </div>
            <div className="w-4 md:w-8" />
            <div className="grid grid-cols-2 gap-1 md:gap-2 flex-1 max-w-[40%]">
              {row.slice(3, 5).map((k) => renderKursiButton(k))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderLayoutTanpa() {
    return (
      <div className="grid grid-cols-6 md:grid-cols-8 gap-1 md:gap-2 h-full w-full">
        {kursi.map((k) => renderKursiButton(k))}
      </div>
    )
  }

  if (loading) {
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
        <p className="text-gray-700 font-medium text-sm">Menyiapkan denah kursi...</p>
      </div>
    )
  }
  
  if (error) return <p className="p-6 text-center text-red-600 mt-10">Error: {error}</p>

  // Kursi yang sudah tidak bisa dipilih (sudah dibayar / sedang di-hold orang
  // lain). Ditampilkan di judul supaya pembeli tahu sisa kursi sejak awal.
  const jumlahTerisi = kursi.filter((k) => k.status === 'terisi' || k.status === 'hold').length
  const ruteTampil = info ? `${info.asal} – ${info.tujuan}` : ''

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-3 md:p-6 pb-2 md:pb-4 bg-white shadow-sm z-10">
        <div className="max-w-md mx-auto">
          {/* Judul + jumlah kursi terisi sejajar, menggantikan baris
              "Layout: 2+2 • Dipilih: 0 kursi" yang membingungkan pembeli.
              Judul sengaja di tengah; rincian rute/kapal/jam rata kiri. */}
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 text-center">
            Pilih Kursi{' '}
            <span className="text-xs md:text-base font-semibold text-gray-500 whitespace-nowrap">
              (terisi : <b className="text-gray-800">{jumlahTerisi}</b> kursi)
            </span>
          </h1>
          {/* Grid 3 kolom (label | titik dua | nilai) supaya tanda ":" rata
              dalam satu kolom. Seluruh baris rata kiri -- dulu teks nilai ikut
              ter-center sehingga tampak berantakan di HP. */}
          <div className="mt-1 grid grid-cols-[auto_auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 text-left text-[11px] md:text-sm text-gray-500">
            <span>Rute</span>
            <span>:</span>
            <span className="font-semibold text-gray-900">{ruteTampil || '—'}</span>

            <span>Kapal</span>
            <span>:</span>
            <span className="font-semibold text-gray-900">{info?.kapal || '—'}</span>

            <span className="whitespace-nowrap">Tanggal / Jam</span>
            <span>:</span>
            <span className="font-semibold text-gray-900">
              {[
                info?.tanggal ? formatTanggalPanjang(info.tanggal) : '',
                // Jam ditulis 16.00 (titik), mengikuti kebiasaan jadwal kapal.
                info?.jam ? jamTampil(info.jam).replace(':', '.') : ''
              ]
                .filter(Boolean)
                .join(' / ') || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-2 md:p-4 flex flex-col max-w-md mx-auto w-full">
        <div className="bg-white p-2 md:p-6 rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col h-full overflow-hidden">
          {kursi.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-4">
              <p className="text-sm font-semibold text-gray-700">Denah kursi belum tersedia.</p>
              <p className="text-xs text-gray-500">
                Jadwal kapal ini belum dibuka untuk pemilihan kursi.
              </p>
              <Link
                href="/jadwal-kapal"
                className="mt-1 text-xs font-bold text-blue-600 hover:underline"
              >
                ← Lihat jadwal kapal hari ini
              </Link>
            </div>
          )}
          {kursi.length > 0 && layout === '2-3' && renderLayout23()}
          {kursi.length > 0 && layout === '2-2' && renderLayout22()}
          {kursi.length > 0 && layout === '3-2' && renderLayout32()}
          {kursi.length > 0 &&
            layout !== '2-3' &&
            layout !== '2-2' &&
            layout !== '3-2' &&
            renderLayoutTanpa()}
        </div>
      </div>

      <div className="flex-shrink-0 p-3 md:p-6 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <p className="text-xs md:text-sm text-gray-800">
              Kursi dipilih:{' '}
              <span className="font-bold text-blue-600">
                {dipilih.length > 0 
                  ? dipilih.map((id) => kursi.find((k) => k.id === id)?.nomor_kursi).join(', ') 
                  : '-'}
              </span>
            </p>
          </div>

          <a
            href={dipilih.length > 0 ? `/form?jadwal=${jadwalId}&kursi=${dipilih.join(',')}` : '#'}
            className={`block text-center font-bold py-3 rounded-lg transition-colors ${
              dipilih.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            onClick={(e) => {
              if (dipilih.length === 0) e.preventDefault();
            }}
          >
            Lanjut Isi Data Penumpang →
          </a>

          <div className="mt-2 md:mt-4 text-center">
            <Link href="/" className="text-xs md:text-sm text-blue-600 hover:underline">
              ← Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function KursiPage() {
  return (
    <Suspense fallback={
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
      </div>
    }>
      <KursiContent />
    </Suspense>
  )
}