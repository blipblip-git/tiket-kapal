'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Editor TEKS halaman "Akun Petugas" (halaman pemilih akun petugas yang dipakai
// Admin Utama tiap penyewa). Disimpan di pengaturan_teks role 'petugas'.
//
// PENTING: halaman ini HANYA mengubah tulisan. Tidak ada tambah/edit/hapus akun
// di sini. Akun petugas adalah milik penyewa dan dibuat oleh Admin Utama
// penyewa masing-masing — Superadmin tidak masuk ke wilayah akun tenant.
type TeksAkunPetugas = {
  judul_akun_petugas: string
  ket_akun_petugas: string
  menu_akun_keberangkatan: string
  ket_akun_keberangkatan: string
  menu_akun_kolektor: string
  ket_akun_kolektor: string
}

const TEKS_AWAL: TeksAkunPetugas = {
  judul_akun_petugas: 'Manajemen Petugas',
  ket_akun_petugas: 'Pilih jenis akun petugas yang ingin dikelola.',
  menu_akun_keberangkatan: 'Manajemen Petugas',
  ket_akun_keberangkatan: 'Akun petugas keberangkatan (scan boarding & manifest) per lokasi.',
  menu_akun_kolektor: 'Manajemen Petugas Kolektor',
  ket_akun_kolektor: 'Akun penagih uang cash dari agen & petugas di lokasi yang sama (Tarakan, Tanjung Selor, KTT, dst).',
}

export default function MotherFileAkunPetugasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')
  const [aksesDitolak, setAksesDitolak] = useState(false)

  const [teks, setTeks] = useState<TeksAkunPetugas>(TEKS_AWAL)

  // Semua kunci lain di data_teks role 'petugas' (judul dashboard, nama menu,
  // dst) disimpan apa adanya supaya tidak terhapus saat menyimpan dari sini.
  const [teksLain, setTeksLain] = useState<Record<string, unknown>>({})

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
        setAksesDitolak(true)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'petugas')
        .maybeSingle()

      const semua = (data?.data_teks || {}) as Record<string, unknown>
      setTeksLain(semua)
      setTeks({
        judul_akun_petugas: (semua.judul_akun_petugas as string) || TEKS_AWAL.judul_akun_petugas,
        ket_akun_petugas: (semua.ket_akun_petugas as string) || TEKS_AWAL.ket_akun_petugas,
        menu_akun_keberangkatan: (semua.menu_akun_keberangkatan as string) || TEKS_AWAL.menu_akun_keberangkatan,
        ket_akun_keberangkatan: (semua.ket_akun_keberangkatan as string) || TEKS_AWAL.ket_akun_keberangkatan,
        menu_akun_kolektor: (semua.menu_akun_kolektor as string) || TEKS_AWAL.menu_akun_kolektor,
        ket_akun_kolektor: (semua.ket_akun_kolektor as string) || TEKS_AWAL.ket_akun_kolektor,
      })
      setLoading(false)
    }
    cekSesiDanAmbilData()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTeks({ ...teks, [e.target.name]: e.target.value })
    setPesan('')
  }

  const handleSimpan = async () => {
    setSaving(true)
    setPesan('')

    try {
      // Gabungan: teks dashboard petugas (tidak diubah di sini) + 6 tulisan
      // halaman Akun Petugas yang sedang diedit.
      const gabungan = { ...teksLain, ...teks }

      const { data: updated, error } = await supabase
        .from('pengaturan_teks')
        .update({ data_teks: gabungan, updated_at: new Date().toISOString() })
        .eq('role', 'petugas')
        .select('id')

      if (error) throw error

      if (!updated || updated.length === 0) {
        const { error: errInsert } = await supabase
          .from('pengaturan_teks')
          .insert({ role: 'petugas', data_teks: gabungan })
        if (errInsert) throw errInsert
      }

      setTeksLain(gabungan)
      setPesan('Berhasil disimpan! Tulisan halaman Akun Petugas sudah berubah.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPesan('Error: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  if (aksesDitolak) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 text-white flex items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Akses ditolak</h1>
          <p className="text-sm text-gray-400 mb-4">Halaman ini khusus Superadmin.</p>
          <button onClick={() => router.push('/superadmin/pusat-kontrol')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-3xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Mother File: Teks Akun Petugas</h1>
            <p className="text-sm text-gray-400">Atur tulisan halaman Akun Petugas. Hanya teks — bukan untuk membuat akun.</p>
          </div>
          <button onClick={() => router.push('/superadmin/pusat-kontrol')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        {/* FORM EDIT */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">

          <div className="bg-blue-900/40 border border-blue-700 rounded-lg p-3">
            <p className="text-xs text-blue-200">
              Akun petugas (keberangkatan &amp; kolektor) dibuat dan dikelola oleh <b>Admin Utama masing-masing penyewa</b>. Di sini hanya mengubah tulisan yang mereka lihat.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Judul Halaman</label>
            <input type="text" name="judul_akun_petugas" value={teks.judul_akun_petugas} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Keterangan Halaman</label>
            <textarea name="ket_akun_petugas" value={teks.ket_akun_petugas} onChange={handleChange} rows={2} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>

          <div className="border-t border-gray-700 pt-4 mt-2">
            <h3 className="text-sm font-bold text-white mb-3">Kartu Petugas Keberangkatan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nama Kartu</label>
                <input type="text" name="menu_akun_keberangkatan" value={teks.menu_akun_keberangkatan} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Keterangan Kartu</label>
                <textarea name="ket_akun_keberangkatan" value={teks.ket_akun_keberangkatan} onChange={handleChange} rows={2} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4 mt-2">
            <h3 className="text-sm font-bold text-white mb-3">Kartu Petugas Kolektor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nama Kartu</label>
                <input type="text" name="menu_akun_kolektor" value={teks.menu_akun_kolektor} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Keterangan Kartu</label>
                <textarea name="ket_akun_kolektor" value={teks.ket_akun_kolektor} onChange={handleChange} rows={2} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
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
