'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Editor teks dashboard PETUGAS KEBERANGKATAN (role: petugas).
// Disimpan di tabel pengaturan_teks dan dibaca /dashboard/keberangkatan.
export default function MotherFilePetugasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')

  const [teks, setTeks] = useState({
    judul_dashboard: '',
    menu_scan: '',
    menu_jual: '',
    menu_laporan: '',
    menu_cetak: '',
  })

  useEffect(() => {
    async function cekSesiDanAmbilData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }

      const { data: profil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profil?.role !== 'superadmin') {
        setPesan('Halaman ini khusus Superadmin.')
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'petugas')
        .maybeSingle()

      if (data?.data_teks) {
        setTeks((lama) => ({ ...lama, ...(data.data_teks as Record<string, string>) }))
      } else {
        setTeks({
          judul_dashboard: 'Dasbor Petugas Keberangkatan',
          menu_scan: 'Scan Boarding',
          menu_jual: 'Jual Tiket',
          menu_laporan: 'Pusat Laporan',
          menu_cetak: 'Cetak Ulang Tiket',
        })
      }
      setLoading(false)
    }
    cekSesiDanAmbilData()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTeks({ ...teks, [e.target.name]: e.target.value })
    setPesan('')
  }

  const handleSimpan = async () => {
    setSaving(true)
    setPesan('')

    try {
      const { data: updated, error } = await supabase
        .from('pengaturan_teks')
        .update({ data_teks: teks, updated_at: new Date().toISOString() })
        .eq('role', 'petugas')
        .select('id')

      if (error) throw error

      if (!updated || updated.length === 0) {
        const { error: errInsert } = await supabase
          .from('pengaturan_teks')
          .insert({ role: 'petugas', data_teks: teks })
        if (errInsert) throw errInsert
      }

      setPesan('Berhasil disimpan! Dashboard semua petugas sudah berubah.')
    } catch (err: any) {
      setPesan('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-3xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Mother File: Petugas</h1>
            <p className="text-sm text-gray-400">Atur judul & nama menu untuk dashboard semua Petugas Keberangkatan.</p>
          </div>
          <button onClick={() => router.push('/superadmin/pusat-kontrol')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        {/* FORM EDIT */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Judul Dashboard</label>
            <input type="text" name="judul_dashboard" value={teks.judul_dashboard} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>

          <div className="border-t border-gray-700 pt-4 mt-2">
            <h3 className="text-sm font-bold text-white mb-3">Menu Dashboard Petugas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Scan Boarding</label>
                <input type="text" name="menu_scan" value={teks.menu_scan} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Jual Tiket</label>
                <input type="text" name="menu_jual" value={teks.menu_jual} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Pusat Laporan</label>
                <input type="text" name="menu_laporan" value={teks.menu_laporan} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Cetak Ulang</label>
                <input type="text" name="menu_cetak" value={teks.menu_cetak} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
            </div>
          </div>

          {pesan && (
            <div className={`p-3 rounded text-sm ${pesan.includes('Berhasil') ? 'bg-green-900/50 text-green-300 border border-green-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
              {pesan}
            </div>
          )}

          <div className="pt-6 border-t border-gray-700 flex justify-end">
            <button onClick={handleSimpan} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg transition disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
