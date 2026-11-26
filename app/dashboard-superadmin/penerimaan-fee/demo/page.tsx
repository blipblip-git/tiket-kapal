'use client'

// app/dashboard-superadmin/penerimaan-fee/demo/page.tsx
// Superadmin REAL melihat fee platform yang benar-benar tercatat di database DEMO.
// Tidak ada angka contoh: demo kosong = semua nol.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { bulanSekarang, formatRupiah, labelBulan } from '@/lib/periode'

const langgananBulan = () => () => {}
const bacaBulanBrowser = () => bulanSekarang()
const bacaBulanServer = () => ''

type RingkasPenyewa = {
  operatorId: string
  namaPenyewa: string
  tiket: number
  total: number
}

type HasilFeeDemo = {
  bulan: string
  feeBerlaku: number
  totalTiket: number
  totalFee: number
  penyewa: RingkasPenyewa[]
}

export default function PenerimaanFeeDemoPage() {
  const router = useRouter()
  // Server snapshot kosong supaya prerender tidak memanggil new Date(); browser
  // memakai bulan lokal. Pilihan bulan disimpan terpisah.
  const [bulanPilihan, setBulanPilihan] = useState<string | null>(null)
  const bulanBrowser = useSyncExternalStore(
    langgananBulan,
    bacaBulanBrowser,
    bacaBulanServer
  )
  const bulan = bulanPilihan ?? bulanBrowser
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState<HasilFeeDemo | null>(null)

  useEffect(() => {
    if (!bulan) return

    async function loadData() {
      setLoading(true)
      setError('')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/superadmin')
        return
      }

      const { data: profil } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profil || (profil.role || '').trim().toLowerCase() !== 'superadmin') {
        router.push('/superadmin')
        return
      }

      try {
        const response = await fetch(`/api/superadmin/demo/fee?bulan=${encodeURIComponent(bulan)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store'
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Gagal memuat fee demo.')
        setHasil(data as HasilFeeDemo)
      } catch (err: unknown) {
        setHasil(null)
        setError(err instanceof Error ? err.message : 'Gagal memuat fee demo.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [bulan, router])

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-5xl mx-auto">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-6 bg-amber-950 border border-amber-800 p-5 rounded-xl">
          <div>
            <h1 className="text-2xl font-bold">Penerimaan Fee Demo</h1>
            <p className="text-sm text-amber-200">Dibaca dari database demo terpisah, bukan dari database real.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard-superadmin/penyewa/demo')}
              className="text-sm bg-amber-900 text-white px-3 py-2 rounded hover:bg-amber-800 border border-amber-700 font-bold"
            >
              Penyewa Demo
            </button>
            <button
              onClick={() => router.push('/dashboard-superadmin/penerimaan-fee')}
              className="text-sm bg-gray-800 text-white px-3 py-2 rounded hover:bg-gray-700 border border-gray-700 font-bold"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        <div className="bg-amber-500 text-gray-950 rounded-xl p-4 mb-6 font-black tracking-wide text-center">
          SIMULASI — BUKAN PENDAPATAN NYATA
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
          <label className="text-sm font-bold text-gray-300" htmlFor="bulan-demo">Bulan</label>
          <input
            id="bulan-demo"
            type="month"
            value={bulan}
            onChange={(e) => setBulanPilihan(e.target.value || null)}
            className="border border-gray-600 bg-gray-900 text-white rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400">Data demo dihitung ulang saat bulan diganti.</p>
        </div>

        {loading ? (
          <p className="p-6 text-center text-gray-400">Memuat fee demo...</p>
        ) : error ? (
          <div className="bg-red-950 border border-red-800 rounded-xl p-5">
            <p className="text-sm font-bold text-red-200">Demo belum bisa dibaca</p>
            <p className="text-xs text-red-100 mt-2 whitespace-pre-wrap">{error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-400">Tiket Demo</p>
                <p className="text-2xl font-bold text-white">{hasil?.totalTiket || 0}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-400">Fee Demo {labelBulan(bulan)}</p>
                <p className="text-2xl font-bold text-amber-300">{formatRupiah(hasil?.totalFee || 0)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-400">Fee per Tiket (demo)</p>
                <p className="text-2xl font-bold text-white">{formatRupiah(hasil?.feeBerlaku || 0)}</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                  <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-4">Penyewa Demo</th>
                      <th className="px-6 py-4 text-right">Tiket</th>
                      <th className="px-6 py-4 text-right">Fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {!hasil || hasil.penyewa.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-10 text-center text-gray-500 italic">
                          Belum ada transaksi demo pada {labelBulan(bulan)}. Database demo masih bersih.
                        </td>
                      </tr>
                    ) : (
                      hasil.penyewa.map((p) => (
                        <tr key={p.operatorId} className="hover:bg-gray-750 transition">
                          <td className="px-6 py-4 font-bold text-white">{p.namaPenyewa}</td>
                          <td className="px-6 py-4 text-right">{p.tiket}</td>
                          <td className="px-6 py-4 text-right font-bold text-amber-300">{formatRupiah(p.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {hasil && hasil.penyewa.length > 0 && (
                    <tfoot className="bg-gray-900 border-t border-gray-700">
                      <tr>
                        <td className="px-6 py-4 font-bold text-white">Total</td>
                        <td className="px-6 py-4 text-right font-bold text-white">{hasil.totalTiket}</td>
                        <td className="px-6 py-4 text-right font-bold text-amber-300">{formatRupiah(hasil.totalFee)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <p className="mt-4 text-[11px] text-gray-400">
              Fee demo memakai snapshot fee di setiap transaksi demo. Kalau snapshot belum ada,
              nilai fee platform demo yang berlaku sekarang dipakai. Tidak ada data real yang
              dibaca atau ditampilkan di halaman ini.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
