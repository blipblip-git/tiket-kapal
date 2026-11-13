'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Kota = {
  id: string
  nama_kota: string
  singkatan: string
}

export default function KamusKotaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [kotaList, setKotaList] = useState<Kota[]>([])
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  // State Modal Tambah/Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inputNama, setInputNama] = useState('')
  const [inputSingkatan, setInputSingkatan] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }
      await fetchKota()
      setLoading(false)
    }
    init()
  }, [router])

  async function fetchKota() {
    const { data, error } = await supabase
      .from('master_kota')
      .select('*')
      .order('nama_kota', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal memuat data: ' + error.message })
      return
    }
    setKotaList(data || [])
  }

  function bukaTambah() {
    setEditingId(null)
    setInputNama('')
    setInputSingkatan('')
    setPesan(null)
    setIsModalOpen(true)
  }

  function bukaEdit(k: Kota) {
    setEditingId(k.id)
    setInputNama(k.nama_kota)
    setInputSingkatan(k.singkatan)
    setPesan(null)
    setIsModalOpen(true)
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setPesan(null)

    const payload = {
      nama_kota: inputNama.trim(),
      singkatan: inputSingkatan.trim().toUpperCase(),
    }

    if (editingId) {
      const { error } = await supabase
        .from('master_kota')
        .update(payload)
        .eq('id', editingId)

      if (error) {
        setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
        setIsSubmitting(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('master_kota')
        .insert(payload)

      if (error) {
        setPesan({ tipe: 'err', teks: 'Gagal tambah: ' + error.message })
        setIsSubmitting(false)
        return
      }
    }

    setIsSubmitting(false)
    setIsModalOpen(false)
    await fetchKota()
  }

  async function handleHapus(id: string, nama: string) {
    if (!confirm(`Yakin mau hapus kota ${nama}?`)) return

    const { error } = await supabase
      .from('master_kota')
      .delete()
      .eq('id', id)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal hapus: ' + error.message })
      return
    }
    await fetchKota()
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Kamus Kota & Singkatan</h1>
            <p className="text-sm text-gray-400">Atur nama kota dan singkatannya untuk cetak thermal.</p>
          </div>
          <button onClick={() => router.push('/superadmin/pusat-kontrol')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        {/* TOMBOL TAMBAH */}
        <div className="flex justify-end mb-4">
          <button 
            onClick={bukaTambah}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg transition flex items-center gap-2"
          >
            <span>📍</span> + Tambah Kota
          </button>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-900/50 text-green-300 border border-green-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
            {pesan.teks}
          </div>
        )}

        {/* TABEL KOTA */}
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="px-6 py-4">Nama Kota / Daerah</th>
                  <th className="px-6 py-4">Singkatan (Cetak)</th>
                  <th className="px-6 py-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {kotaList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-gray-500 italic">Belum ada data kota.</td>
                  </tr>
                ) : (
                  kotaList.map((k) => (
                    <tr key={k.id} className="hover:bg-gray-750 transition">
                      <td className="px-6 py-4 font-bold text-white">{k.nama_kota}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs font-mono font-bold">
                          {k.singkatan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => bukaEdit(k)} className="text-blue-400 hover:text-blue-300 text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => handleHapus(k.id, k.nama_kota)} className="text-red-400 hover:text-red-300 text-xs font-medium">Hapus</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="font-bold text-lg text-white">{editingId ? 'Edit Kota' : 'Tambah Kota Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            
            <form onSubmit={handleSimpan} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nama Kota / Daerah</label>
                <input 
                  type="text" required
                  value={inputNama}
                  onChange={(e) => setInputNama(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                  placeholder="Contoh: Tarakan"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Singkatan (Maks 3 Huruf)</label>
                <input 
                  type="text" required maxLength={3}
                  value={inputSingkatan}
                  onChange={(e) => setInputSingkatan(e.target.value.toUpperCase())}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none font-mono"
                  placeholder="Contoh: TRK"
                />
                <p className="text-[10px] text-gray-500 mt-1">*Singkatan ini akan muncul di cetak thermal.</p>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded text-gray-300 hover:bg-gray-700 text-sm font-medium">Batal</button>
                <button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm disabled:opacity-50">
                  {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}