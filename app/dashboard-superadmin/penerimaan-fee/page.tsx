'use client'

// app/dashboard-superadmin/penerimaan-fee/page.tsx
// KHUSUS SUPERADMIN: atur Fee Platform (nilai global) + masuk ke laporan fee
// harian / bulanan dari semua penjualan offline (agen & petugas).
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ambilTarifFee, simpanFeeKanal, feeKanalAda, tabelPlatformAda } from '@/lib/fee'
import { muatLaporanFeePlatform } from '@/lib/laporanFee'
import { bulanSekarang, formatRupiah, labelBulan } from '@/lib/periode'

export default function PenerimaanFeePage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>}>
      <PenerimaanFeeContent />
    </Suspense>
  )
}

function PenerimaanFeeContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [proses, setProses] = useState(false)

  const [tarifTersimpan, setTarifTersimpan] = useState({ offline: 0, online: 0 })
  const [inputOffline, setInputOffline] = useState('0')
  const [inputOnline, setInputOnline] = useState('0')
  const [adaTabel, setAdaTabel] = useState(true)
  const [adaKanal, setAdaKanal] = useState(true)
  const [ringkas, setRingkas] = useState({ tiket: 0, fee: 0, tiketOnline: 0, feeOnline: 0 })

  const bulanAktif = bulanSekarang()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }

      const { data: p, error: errP } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (errP || !p || (p.role || '').trim().toLowerCase() !== 'superadmin') {
        setError('Akses ditolak. Halaman ini khusus Superadmin.')
        setLoading(false)
        return
      }

      const ada = await tabelPlatformAda()
      setAdaTabel(ada)
      setAdaKanal(await feeKanalAda())

      const tarif = await ambilTarifFee()
      setTarifTersimpan(tarif)
      setInputOffline(String(tarif.offline))
      setInputOnline(String(tarif.online))

      const offline = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif, kanal: 'offline' })
      const online = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif, kanal: 'online' })
      setRingkas({
        tiket: offline.totalTiket,
        fee: offline.totalFee,
        tiketOnline: online.totalTiket,
        feeOnline: online.totalFee
      })

      setLoading(false)
    }
    loadData()
  }, [router, bulanAktif])

  const simpan = async () => {
    setProses(true)
    setPesan('')
    const tarif = {
      offline: Math.max(0, Math.round(Number(inputOffline) || 0)),
      online: Math.max(0, Math.round(Number(inputOnline) || 0))
    }
    const hasil = await simpanFeeKanal(tarif, 'Superadmin')
    if (hasil) {
      setPesan(hasil)
    } else {
      setTarifTersimpan(tarif)
      setPesan(
        'Tarif tersimpan: offline ' + formatRupiah(tarif.offline) + ' / tiket, online ' + formatRupiah(tarif.online) + ' / tiket.'
      )
      const offline = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif, kanal: 'offline' })
      const online = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif, kanal: 'online' })
      setRingkas({
        tiket: offline.totalTiket,
        fee: offline.totalFee,
        tiketOnline: online.totalTiket,
        feeOnline: online.totalFee
      })
    }
    setProses(false)
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-6 bg-red-950 border border-red-800 p-5 rounded-xl">
          <div>
            <h1 className="text-2xl font-bold">Penerimaan Fee Real</h1>
            <p className="text-sm text-red-200">
              Fee platform dari semua penjualan di database real: offline (petugas &amp; agen) dan online (web).
            </p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="text-sm bg-gray-800 text-white px-3 py-2 rounded hover:bg-gray-700 border border-gray-700 font-bold">
            &larr; Kembali
          </button>
        </div>

        {/* PENGATURAN FEE PLATFORM (2 TARIF, TIDAK DIJUMLAH) */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl">💵</div>
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-bold text-white">Fee Platform per Tiket</p>
              <p className="text-xs text-gray-400">
                Tarif dipilih sesuai kanal. Penjualan online <span className="font-bold text-red-300">tidak</span> ditambah tarif offline.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <div className="flex-1">
                <p className="text-xs font-bold text-white">Offline (petugas &amp; agen)</p>
                <p className="text-[11px] text-gray-400">Berlaku: {formatRupiah(tarifTersimpan.offline)} / tiket dewasa</p>
              </div>
              <input
                type="number"
                min={0}
                step={500}
                value={inputOffline}
                onChange={(e) => setInputOffline(e.target.value)}
                className="w-28 border border-gray-600 bg-gray-800 text-white rounded px-2 py-1.5 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <div className="flex-1">
                <p className="text-xs font-bold text-white">Online (web)</p>
                <p className="text-[11px] text-gray-400">Berlaku: {formatRupiah(tarifTersimpan.online)} / tiket dewasa</p>
              </div>
              <input
                type="number"
                min={0}
                step={500}
                value={inputOnline}
                onChange={(e) => setInputOnline(e.target.value)}
                className="w-28 border border-gray-600 bg-gray-800 text-white rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button
              onClick={simpan}
              disabled={proses || !adaTabel || !adaKanal}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-bold"
            >
              {proses ? 'Menyimpan...' : 'Simpan Tarif'}
            </button>
          </div>

          {pesan && <p className="mt-3 text-xs text-green-300">{pesan}</p>}
          {!adaTabel && (
            <p className="mt-3 text-xs text-red-300">
              Tabel <span className="font-mono">pengaturan_platform</span> belum ada. Jalankan SQL migrasi fee dulu.
            </p>
          )}
          {!adaKanal && (
            <p className="mt-3 text-xs text-red-300">
              Kolom <span className="font-mono">fee_offline</span> / <span className="font-mono">fee_online</span> belum ada. Jalankan{' '}
              <span className="font-mono">supabase/fee-kanal.sql</span> dulu.
            </p>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            Catatan: nilai fee dibekukan di setiap transaksi. Transaksi lama yang belum punya catatan fee dihitung memakai nilai yang berlaku sekarang.
          </p>
        </div>

        {/* RINGKASAN BULAN INI */}
        <div className="bg-gray-800 border border-red-800 rounded-xl p-5 mb-6 space-y-2">
          <p className="text-sm font-bold text-white">Fee {labelBulan(bulanAktif)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-gray-300">{ringkas.tiket} tiket offline</p>
            <p className="ml-auto text-lg font-bold text-red-300">{formatRupiah(ringkas.fee)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-700 pt-2">
            <p className="text-sm text-gray-300">{ringkas.tiketOnline} tiket online</p>
            <p className="ml-auto text-lg font-bold text-amber-300">{formatRupiah(ringkas.feeOnline)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/harian?kanal=offline')}
            className="bg-red-950 p-8 rounded-xl border border-red-800 hover:bg-red-900 transition text-left flex flex-col items-start h-44 justify-center"
          >
            <div className="text-4xl mb-3">📅</div>
            <h2 className="text-lg font-bold text-white mb-1">Laporan Fee Harian</h2>
            <p className="text-xs text-red-200">Fee platform per jam &amp; kapal untuk 1 tanggal (offline / online).</p>
          </button>

          <button
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/bulanan?kanal=offline')}
            className="bg-red-950 p-8 rounded-xl border border-red-800 hover:bg-red-900 transition text-left flex flex-col items-start h-44 justify-center"
          >
            <div className="text-4xl mb-3">🗓️</div>
            <h2 className="text-lg font-bold text-white mb-1">Laporan Fee Bulanan</h2>
            <p className="text-xs text-red-200">Fee platform per tanggal &amp; kapal dalam 1 bulan (offline / online).</p>
          </button>

          <button
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/demo')}
            className="md:col-span-2 bg-amber-950 p-8 rounded-xl border border-amber-800 hover:bg-amber-900 transition text-left flex flex-col items-start h-44 justify-center"
          >
            <div className="text-4xl mb-3">🧪</div>
            <h2 className="text-lg font-bold text-white mb-1">Penerimaan Fee Demo</h2>
            <p className="text-xs text-amber-200">
              Fee dari database demo. <span className="font-bold">SIMULASI — bukan pendapatan nyata.</span>
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
