'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MotherFileAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')

  // State untuk nyimpen teks yang mau diedit
  const [teks, setTeks] = useState({
    judul_dashboard: '',
    sub_judul: '',
    tombol_ganti_password: '',
    tombol_logout: '',
    menu_kapal: '',
    menu_jadwal: '',
    menu_petugas: '',
    menu_agen: '',
    menu_pengaturan: '',
    menu_laporan: '',
    menu_audit: '',
  })

  useEffect(() => {
    async function cekSesiDanAmbilData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }

      // Ambil data teks dari database
      const { data, error } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'admin_utama')
        .single()

      if (data && data.data_teks) {
        setTeks(data.data_teks)
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
      const { error } = await supabase
        .from('pengaturan_teks')
        .update({ data_teks: teks, updated_at: new Date().toISOString() })
        .eq('role', 'admin_utama')

      if (error) throw error
      
      setPesan('Berhasil disimpan! Semua kamar Admin sudah berubah.')
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
            <h1 className="text-2xl font-bold text-white">Mother File: Admin Utama</h1>
            <p className="text-sm text-gray-400">Atur teks & tombol untuk semua kamar Admin Utama.</p>
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

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Sub Judul</label>
            <input type="text" name="sub_judul" value={teks.sub_judul} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Tombol Ganti Password</label>
              <input type="text" name="tombol_ganti_password" value={teks.tombol_ganti_password} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Tombol Logout</label>
              <input type="text" name="tombol_logout" value={teks.tombol_logout} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4 mt-2">
            <h3 className="text-sm font-bold text-white mb-3">Menu Grid Dashboard</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Kapal</label>
                <input type="text" name="menu_kapal" value={teks.menu_kapal} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Jadwal</label>
                <input type="text" name="menu_jadwal" value={teks.menu_jadwal} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Petugas</label>
                <input type="text" name="menu_petugas" value={teks.menu_petugas} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Agen</label>
                <input type="text" name="menu_agen" value={teks.menu_agen} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Pengaturan</label>
                <input type="text" name="menu_pengaturan" value={teks.menu_pengaturan} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Laporan</label>
                <input type="text" name="menu_laporan" value={teks.menu_laporan} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Menu Audit Log</label>
                <input type="text" name="menu_audit" value={teks.menu_audit} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
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