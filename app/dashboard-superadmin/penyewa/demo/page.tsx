'use client'

// app/dashboard-superadmin/penyewa/demo/page.tsx
// Superadmin REAL melihat daftar penyewa yang benar-benar ada di database DEMO.
// Demo tidak punya Superadmin dan tidak punya halaman ini. Tidak ada data contoh:
// kalau database demo masih bersih, daftar ini kosong.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PenyewaDemo = {
  id: string
  nama: string
  email: string
  nomor_hp: string | null
  nama_perusahaan: string | null
  aktif: boolean
  created_at: string
}

export default function DaftarPenyewaDemoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [penyewaList, setPenyewaList] = useState<PenyewaDemo[]>([])
  const [demoUrl, setDemoUrl] = useState('')

  useEffect(() => {
    async function loadData() {
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
        const response = await fetch('/api/superadmin/demo/penyewa', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store'
        })
        const hasil = await response.json()
        if (!response.ok) throw new Error(hasil.error || 'Gagal memuat penyewa demo.')
        setPenyewaList((hasil.penyewa || []) as PenyewaDemo[])
        setDemoUrl(String(hasil.demoUrl || process.env.NEXT_PUBLIC_DEMO_URL || '').trim())
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Gagal memuat penyewa demo.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  if (loading) {
    return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat penyewa demo...</p>
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-6xl mx-auto">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Daftar Penyewa Demo</h1>
            <p className="text-sm text-gray-400">Dibaca langsung dari database demo. Tidak ada data real di halaman ini.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/demo')}
              className="bg-amber-900 hover:bg-amber-800 text-white px-4 py-2 rounded text-sm font-bold border border-amber-700"
            >
              Fee Demo
            </button>
            <button
              onClick={() => router.push('/dashboard-superadmin/penyewa')}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        <div className="bg-amber-950/60 border border-amber-800 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-200">Environment demo terpisah</p>
          <p className="text-xs text-amber-100/80 mt-1">
            Demo tidak memiliki Superadmin, Pusat Kontrol, atau Data Penyewa sendiri.
            Superadmin REAL hanya memantau daftar dan fee demo lewat server.
          </p>
        </div>

        {error ? (
          <div className="bg-red-950 border border-red-800 rounded-xl p-5">
            <p className="text-sm font-bold text-red-200">Demo belum bisa dibaca</p>
            <p className="text-xs text-red-100 mt-2 whitespace-pre-wrap">{error}</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-4">Nama Pemilik / PT</th>
                    <th className="px-6 py-4">Kontak</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Terdaftar</th>
                    <th className="px-6 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {penyewaList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                        Belum ada penyewa demo. Database demo masih bersih.
                      </td>
                    </tr>
                  ) : (
                    penyewaList.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-750 transition">
                        <td className="px-6 py-4">
                          <p className="font-bold text-white">{p.nama}</p>
                          <p className="text-xs text-gray-400">{p.nama_perusahaan || '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p>{p.email}</p>
                          <p className="text-xs text-green-400">{p.nomor_hp || 'Belum ada WA'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${p.aktif ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                            {p.aktif ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {demoUrl ? (
                            <a
                              href={demoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-400 hover:text-amber-300 text-xs font-bold"
                            >
                              Buka Demo
                            </a>
                          ) : (
                            <span className="text-xs text-gray-500">URL demo belum diset</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
