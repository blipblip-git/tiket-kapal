'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function EditTeksAgenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')
  const [isEditMode, setIsEditMode] = useState(false)

  const [teks, setTeks] = useState({
    judul_dashboard: 'Dashboard Agen',
    menu_jual: 'Jual Tiket',
    menu_laporan: 'Laporan Penjualan',
    menu_cetak: 'Cetak Ulang Tiket',
  })

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }

      const { data } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'agen')
        .single()

      if (data && data.data_teks) {
        setTeks(data.data_teks as any)
      }
      setLoading(false)
    }
    fetchData()
  }, [router])

  async function handleSimpan() {
    setSaving(true)
    setPesan('')

    const { error } = await supabase
      .from('pengaturan_teks')
      .update({ data_teks: teks, updated_at: new Date().toISOString() })
      .eq('role', 'agen')

    if (error) {
      setPesan('Gagal menyimpan: ' + error.message)
    } else {
      setPesan('✅ Berhasil disimpan!')
      setIsEditMode(false)
    }
    setSaving(false)
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  return (
    <div className="h-screen bg-gray-100 flex flex-col relative">
      
      {/* TOMBOL PENSIL DI POJOK KANAN ATAS */}
      <div className="absolute top-4 right-4 z-50">
        {isEditMode ? (
          <button 
            onClick={handleSimpan}
            disabled={saving}
            className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg font-bold text-sm hover:bg-green-700 transition"
          >
            {saving ? 'Menyimpan...' : '💾 Simpan Perubahan'}
          </button>
        ) : (
          <button 
            onClick={() => setIsEditMode(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg font-bold text-sm hover:bg-blue-700 transition flex items-center gap-2"
          >
            ✏️ Edit Tampilan
          </button>
        )}
      </div>

      {/* TAMPILAN ASLI DASHBOARD AGEN (PREVIEW) */}
      <div className="max-w-md w-full mx-auto p-4 flex-1 flex flex-col pt-16">
        
        {/* HEADER */}
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {isEditMode ? (
                <input 
                  type="text"
                  value={teks.judul_dashboard}
                  onChange={(e) => setTeks({...teks, judul_dashboard: e.target.value})}
                  className="text-lg font-bold text-gray-900 leading-tight w-full bg-yellow-50 border border-yellow-300 rounded px-2 py-1 focus:outline-none" 
                />
              ) : (
                <h1 className="text-lg font-bold text-gray-900 leading-tight">{teks.judul_dashboard}</h1>
              )}
              <p className="text-sm text-gray-600 mt-1 font-medium">Tarakan - Agen Tarakan</p>
            </div>
            <button className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold shadow-sm opacity-50 cursor-not-allowed">
              Logout
            </button>
          </div>
        </div>

        {/* MENU UTAMA */}
        <div className="flex-1 flex flex-col gap-3">
          
          {/* Menu Jual Tiket */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className="text-3xl bg-green-50 w-14 h-14 flex items-center justify-center rounded-lg">💵</div>
            {isEditMode ? (
              <input 
                type="text"
                value={teks.menu_jual}
                onChange={(e) => setTeks({...teks, menu_jual: e.target.value})}
                className="text-base font-bold text-gray-900 flex-1 bg-yellow-50 border border-yellow-300 rounded px-2 py-1 focus:outline-none" 
              />
            ) : (
              <h2 
                className="text-base font-bold text-gray-900 flex-1 cursor-pointer"
                onClick={() => router.push('/agen/jual-tiket?preview=true')} 
              >
                {teks.menu_jual}
              </h2>
            )}
            {!isEditMode && <span className="text-gray-400 text-xl font-light">&rsaquo;</span>}
          </div>

          {/* Menu Laporan */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className="text-3xl bg-purple-50 w-14 h-14 flex items-center justify-center rounded-lg">📊</div>
            {isEditMode ? (
              <input 
                type="text"
                value={teks.menu_laporan}
                onChange={(e) => setTeks({...teks, menu_laporan: e.target.value})}
                className="text-base font-bold text-gray-900 flex-1 bg-yellow-50 border border-yellow-300 rounded px-2 py-1 focus:outline-none" 
              />
            ) : (
              <h2 
                className="text-base font-bold text-gray-900 flex-1 cursor-pointer"
                onClick={() => router.push('/agen/laporan?preview=true')} 
              >
                {teks.menu_laporan}
              </h2>
            )}
            {!isEditMode && <span className="text-gray-400 text-xl font-light">&rsaquo;</span>}
          </div>

          {/* Menu Cetak Ulang */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className="text-3xl bg-orange-50 w-14 h-14 flex items-center justify-center rounded-lg">🖨️</div>
            {isEditMode ? (
              <input 
                type="text"
                value={teks.menu_cetak}
                onChange={(e) => setTeks({...teks, menu_cetak: e.target.value})}
                className="text-base font-bold text-gray-900 flex-1 bg-yellow-50 border border-yellow-300 rounded px-2 py-1 focus:outline-none" 
              />
            ) : (
              <h2 
                className="text-base font-bold text-gray-900 flex-1 cursor-pointer"
                onClick={() => router.push('/cetak-ulang?preview=true')} 
              >
                {teks.menu_cetak}
              </h2>
            )}
            {!isEditMode && <span className="text-gray-400 text-xl font-light">&rsaquo;</span>}
          </div>

        </div>
      </div>
    </div>
  )
}