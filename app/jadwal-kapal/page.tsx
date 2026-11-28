'use client'

// app/jadwal-kapal/page.tsx
// Halaman publik "Jadwal Kapal Hari ini": semua rute yang beroperasi hari ini.
// Data dari /api/publik/jadwal-hari-ini (template_jadwal + jadwal), jadi rute
// baru otomatis muncul tanpa mengubah halaman ini.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchPublik } from '@/lib/publikFetch'
import { formatTanggalPanjang } from '@/lib/hari'
import IkonKapal from '@/components/IkonKapal'

type Jadwal = {
  id: string
  nama_kapal: string
  jam_berangkat: string
  status_jadwal: string
}

type Rute = {
  asal: string
  tujuan: string
  jadwal: Jadwal[]
}

type Grup = {
  kunci: string
  arah: Rute[]
}

function jamTampil(jam: string): string {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(String(jam || '').trim())
  if (!cocok) return String(jam || '').slice(0, 5)
  return `${cocok[1].padStart(2, '0')}:${cocok[2]}`
}

// Close kalau kapal sudah berangkat (status_jadwal bukan 'open') atau tiket
// sudah ditutup 60 menit sebelum jam berangkat — sama dengan aturan /pilih-jadwal.
function statusTampil(j: Jadwal, sekarangMs: number): 'open' | 'close' {
  if (String(j.status_jadwal || '').toLowerCase() !== 'open') return 'close'

  const wita = new Date(sekarangMs + 8 * 60 * 60 * 1000)
  const menitSekarang = wita.getUTCHours() * 60 + wita.getUTCMinutes()
  const [jam, menit] = jamTampil(j.jam_berangkat).split(':').map(Number)
  if (!Number.isFinite(jam) || !Number.isFinite(menit)) return 'open'

  return menitSekarang >= jam * 60 + menit - 60 ? 'close' : 'open'
}

// Satu kartu per pasangan rute (Tarakan–Tanjung), arah bisa diputar.
function buatGrup(rute: Rute[]): Grup[] {
  const peta = new Map<string, Grup>()

  for (const r of rute) {
    if (!r.asal || !r.tujuan) continue
    const kunci = [r.asal, r.tujuan].sort().join('|')
    if (!peta.has(kunci)) peta.set(kunci, { kunci, arah: [] })
    peta.get(kunci)!.arah.push(r)
  }

  return [...peta.values()].sort(
    (a, b) =>
      a.arah[0].asal.localeCompare(b.arah[0].asal) ||
      a.arah[0].tujuan.localeCompare(b.arah[0].tujuan)
  )
}

function KartuRute({
  grup,
  sekarang,
  dibalik,
  tanggal,
  onPutar
}: {
  grup: Grup
  sekarang: number
  dibalik: boolean
  tanggal: string
  onPutar: () => void
}) {
  const router = useRouter()
  const utama = grup.arah[0]
  const asal = dibalik ? utama.tujuan : utama.asal
  const tujuan = dibalik ? utama.asal : utama.tujuan
  const arahAktif = grup.arah.find((r) => r.asal === asal && r.tujuan === tujuan)

  // Klik judul rute membuka "Pilih Jadwal" (semua kapal + jam untuk rute itu,
  // berguna saat nanti satu rute punya banyak jam keberangkatan).
  const bukaJadwal = () => {
    if (!asal || !tujuan) return
    const params = new URLSearchParams({ asal, tujuan })
    if (tanggal) params.set('tanggal', tanggal)
    router.push(`/pilih-jadwal?${params.toString()}`)
  }

  // Klik baris kapal langsung membuka denah kursi jadwal tersebut — satu klik
  // lebih sedikit untuk pembeli yang sudah tahu kapal + jam yang diinginkan.
  const bukaKursi = (jadwalId: string) => {
    if (!jadwalId) return
    router.push(`/kursi?jadwal=${jadwalId}`)
  }

  const baris = [...(arahAktif?.jadwal || [])].sort(
    (a, b) =>
      jamTampil(a.jam_berangkat).localeCompare(jamTampil(b.jam_berangkat)) ||
      a.nama_kapal.localeCompare(b.nama_kapal)
  )

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="flex flex-nowrap items-center gap-x-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-gray-100 bg-gray-50">
        {/* Judul dua arah: kiri arah yang sedang tampil, panah di tengah
            (tombol putar), kanan arah kebalikannya. Tidak ada label "Rute"
            lagi. key ikut berubah saat diputar supaya teks bergeser masuk
            sehingga perubahan arah langsung terlihat. Font dibuat kecil di
            HP supaya kedua arah tetap muat satu baris (tidak jadi 2 lapis). */}
        <h2 className="shrink-0">
          <button
            type="button"
            onClick={bukaJadwal}
            title={`Lihat jadwal ${asal} - ${tujuan}`}
            className="group flex items-center gap-1"
          >
            <span
              key={`${asal}-${tujuan}`}
              className="rute-geser text-[12px] sm:text-base font-bold text-gray-900 whitespace-nowrap group-hover:text-purple-700 group-hover:underline underline-offset-2"
            >
              {asal} &ndash; {tujuan}
            </span>
            <svg
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </h2>
        {/* Panah + arah kebalikan dibungkus supaya tetap satu baris. Teks arah
            kebalikan dipotong rapi kalau layar benar-benar sempit. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onPutar}
            title="Putar arah rute"
            aria-label={`Putar arah rute ${asal} - ${tujuan}`}
            className="shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:text-purple-700 hover:border-purple-300 transition-colors"
          >
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8h13m0 0l-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0l3.5-3.5M7 16l3.5 3.5"
              />
            </svg>
          </button>
          <span
            key={`${tujuan}-${asal}`}
            className="rute-geser min-w-0 truncate text-[10px] sm:text-xs font-semibold text-gray-400 whitespace-nowrap"
          >
            {tujuan} &ndash; {asal}
          </span>
        </div>
      </div>

      {baris.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500">
          Belum ada jadwal arah ini hari ini.
        </p>
      ) : (
        <table className="w-full text-sm text-left">
          <thead className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 font-semibold">Nama Kapal</th>
              <th className="px-2 py-2 font-semibold whitespace-nowrap">Jam</th>
              <th className="px-4 py-2 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {baris.map((j) => {
              const tutup = statusTampil(j, sekarang) === 'close'
              return (
                <tr
                  key={j.id}
                  onClick={tutup ? undefined : () => bukaKursi(j.id)}
                  onKeyDown={
                    tutup
                      ? undefined
                      : (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            bukaKursi(j.id)
                          }
                        }
                  }
                  tabIndex={tutup ? undefined : 0}
                  title={
                    tutup
                      ? 'Tiket sudah ditutup'
                      : `Pilih kursi ${j.nama_kapal} ${jamTampil(j.jam_berangkat)}`
                  }
                  className={
                    tutup
                      ? 'text-gray-400 opacity-60'
                      : 'text-gray-800 cursor-pointer hover:bg-purple-50 focus:bg-purple-50 focus:outline-none'
                  }
                >
                  <td className="px-4 py-2.5 font-medium">{j.nama_kapal}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">
                    {jamTampil(j.jam_berangkat)}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full ${
                        tutup ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {tutup ? 'Close' : 'Open'}
                    </span>
                    {!tutup && (
                      <svg
                        className="inline-block w-3.5 h-3.5 ml-1.5 -mt-0.5 text-purple-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function JadwalKapalPage() {
  const router = useRouter()
  const [rute, setRute] = useState<Rute[]>([])
  const [tanggal, setTanggal] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sekarang, setSekarang] = useState(0)
  const [diperbarui, setDiperbarui] = useState('')
  // Arah rute yang sedang diputar. Disimpan di halaman (bukan di kartu) supaya
  // tombol Reset di kanan atas bisa mengembalikan SEMUA kartu ke arah awal.
  const [dibalik, setDibalik] = useState<Record<string, boolean>>({})

  // Ambil data mentah (tanpa setState) supaya bisa dipakai effect & tombol.
  const ambilData = useCallback(async () => {
    const res = await fetchPublik('/api/publik/jadwal-hari-ini', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Gagal memuat jadwal.')

    const wita = new Date(Date.now() + 8 * 60 * 60 * 1000)

    return {
      rute: Array.isArray(data?.rute) ? (data.rute as Rute[]) : [],
      tanggal: String(data?.tanggal || ''),
      diperbarui: `${String(wita.getUTCHours()).padStart(2, '0')}:${String(
        wita.getUTCMinutes()
      ).padStart(2, '0')}`
    }
  }, [])

  const muat = useCallback(async () => {
    try {
      const hasil = await ambilData()
      setRute(hasil.rute)
      setTanggal(hasil.tanggal)
      setDiperbarui(hasil.diperbarui)
      setSekarang(Date.now())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal.')
    } finally {
      setLoading(false)
    }
  }, [ambilData])

  useEffect(() => {
    let aktif = true
    const jalan = async () => {
      try {
        const hasil = await ambilData()
        if (!aktif) return
        setRute(hasil.rute)
        setTanggal(hasil.tanggal)
        setDiperbarui(hasil.diperbarui)
        setSekarang(Date.now())
        setError('')
      } catch (err) {
        if (!aktif) return
        setError(err instanceof Error ? err.message : 'Gagal memuat jadwal.')
      } finally {
        if (aktif) setLoading(false)
      }
    }
    jalan()
    return () => {
      aktif = false
    }
  }, [ambilData])

  // Perbarui jam (status Close/Open) dan ambil ulang data tiap menit supaya
  // perubahan status jadwal ikut terlihat.
  useEffect(() => {
    const timer = setInterval(() => {
      setSekarang(Date.now())
      muat()
    }, 60000)
    return () => clearInterval(timer)
  }, [muat])

  const grup = buatGrup(rute)

  // Tombol kanan atas: kembalikan tampilan ke kondisi awal (semua arah rute
  // seperti pertama dibuka), lalu ambil data terbaru dan gulir ke atas.
  const resetTampilan = useCallback(() => {
    setDibalik({})
    muat()
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [muat])

  const putarArah = (kunci: string) =>
    setDibalik((peta) => ({ ...peta, [kunci]: !peta[kunci] }))

  return (
    <div className="min-h-[100dvh] w-full bg-purple-700 py-6 px-3 sm:px-4">
      {/* Animasi teks rute: saat arah diputar, nama kota bergeser masuk dari
          kanan ke kiri supaya perubahan arah langsung terlihat. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes rute-geser-masuk {
              from { opacity: 0; transform: translateX(14px); }
              to   { opacity: 1; transform: translateX(0); }
            }
            .rute-geser { animation: rute-geser-masuk 0.28s ease-out; }
            @media (prefers-reduced-motion: reduce) {
              .rute-geser { animation: none; }
            }
          `
        }}
      />
      <div className="w-full max-w-xl mx-auto">

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-white/80 hover:text-white text-xs font-medium"
            >
              &larr; Beranda
            </button>
            <h1 className="text-white text-xl sm:text-2xl font-bold mt-1">
              Jadwal Kapal Hari ini
            </h1>
            <p className="text-white/70 text-xs sm:text-sm mt-0.5">
              {tanggal ? formatTanggalPanjang(tanggal) : 'Memuat tanggal…'}
            </p>
          </div>

          {/* Tombol Reset tampilan (ilustrasi kapal di header dihapus atas
              permintaan pemilik). */}
          <button
            type="button"
            onClick={resetTampilan}
            title="Kembalikan semua rute ke arah awal"
            aria-label="Kembalikan semua rute ke arah awal"
            className="shrink-0 flex items-center gap-1 rounded-full bg-white/10 border border-white/30 pl-2 pr-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8h13m0 0l-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0l3.5-3.5M7 16l3.5 3.5"
              />
            </svg>
            Reset
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg px-4 py-10 text-center">
            <p className="text-sm text-gray-500">Memuat jadwal kapal…</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                muat()
              }}
              className="mt-3 text-sm font-bold text-red-700 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        ) : grup.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg px-4 py-10 text-center">
            <IkonKapal variant="garis" className="w-[70px] h-auto mx-auto mb-3 text-purple-300" />
            <p className="text-sm text-gray-600">Belum ada jadwal kapal untuk hari ini.</p>
            <p className="text-xs text-gray-400 mt-1">
              Jadwal muncul otomatis setelah pemilik kapal menambah rute di Manajemen Jadwal.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[11px] sm:text-xs text-white/85">
              Ketuk nama rute untuk melihat semua kapal &amp; jam keberangkatan,
              atau ketuk nama kapal untuk langsung memilih kursi.
            </p>
            <div className="space-y-4">
              {grup.map((g) => (
                <KartuRute
                  key={g.kunci}
                  grup={g}
                  sekarang={sekarang}
                  dibalik={!!dibalik[g.kunci]}
                  tanggal={tanggal}
                  onPutar={() => putarArah(g.kunci)}
                />
              ))}
            </div>
          </>
        )}

        <p className="mt-5 text-[11px] text-white/70 leading-relaxed">
          Status <span className="font-bold">Close</span> berarti tiket sudah ditutup (60 menit
          sebelum berangkat atau kapal sudah berangkat). Jadwal diperbarui otomatis tiap menit.
          {diperbarui && <> Terakhir diperbarui {diperbarui} WITA.</>}
        </p>
      </div>
    </div>
  )
}
