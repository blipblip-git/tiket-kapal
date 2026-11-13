'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Penyewa = {
  id: string
  nama: string
  email: string
  nomor_hp: string
  nama_perusahaan: string
  aktif: boolean
  created_at: string
}

export default function DaftarPenyewaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [penyewaList, setPenyewaList] = useState<Penyewa[]>([])
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    password: '',
    nama_perusahaan: '',
    nomor_hp: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pesan, setPesan] = useState('')

  useEffect(() => {
    async function cekSesi() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }
      fetchPenyewa()
    }
    cekSesi()
  }, [router])

  async function fetchPenyewa() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama, email, nomor_hp, nama_perusahaan, aktif, created_at')
      .eq('role', 'admin_utama')
      .neq('email', 'superadmin@gmail.com')
      .order('created_at', { ascending: false })

    if (!error && data) setPenyewaList(data as Penyewa[])
    setLoading(false)
  }

  function handleBukaTambah() {
    setEditingId(null)
    setFormData({ nama: '', email: '', password: '', nama_perusahaan: '', nomor_hp: '' })
    setPesan('')
    setIsModalOpen(true)
  }

  function handleBukaEdit(p: Penyewa) {
    setEditingId(p.id)
    setFormData({
      nama: p.nama,
      email: p.email,
      password: '',
      nama_perusahaan: p.nama_perusahaan || '',
      nomor_hp: p.nomor_hp || ''
    })
    setPesan('')
    setIsModalOpen(true)
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setPesan('')

    try {
      if (editingId) {
        const { error } = await supabase
          .from('profiles')
          .update({
            nama: formData.nama,
            nama_perusahaan: formData.nama_perusahaan,
            nomor_hp: formData.nomor_hp
          })
          .eq('id', editingId)
        
        if (error) throw new Error(error.message)
        setPesan('Berhasil update data penyewa!')
      } else {
        const response = await fetch('/api/superadmin/tambah-penyewa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Gagal menambahkan')
        setPesan('Berhasil menambahkan penyewa!')
      }

      setIsModalOpen(false)
      fetchPenyewa()
    } catch (err: any) {
      setPesan('Error: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleHapus(id: string, nama: string) {
    if (!confirm(`Yakin mau hapus penyewa ${nama}? Akses login mereka akan hilang selamanya.`)) return
    
    try {
      const response = await fetch('/api/superadmin/hapus-penyewa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Gagal menghapus')
      alert('Penyewa berhasil dihapus.')
      fetchPenyewa()
    } catch (err: any) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat data...</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Daftar Penyewa</h1>
            <p className="text-sm text-gray-400">Pemilik Kapal yang terdaftar di platform.</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin/penyewa')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        <div className="flex justify-end mb-4">
          <button onClick={handleBukaTambah} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg transition">
            + Tambah Penyewa Baru
          </button>
        </div>

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
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">Belum ada penyewa terdaftar.</td></tr>
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
                      <td className="px-6 py-4">{new Date(p.created_at).toLocaleDateString('id-ID')}</td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => handleBukaEdit(p)} className="text-blue-400 hover:text-blue-300 text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => handleHapus(p.id, p.nama)} className="text-red-400 hover:text-red-300 text-xs font-medium">Hapus</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="font-bold text-lg text-white">{editingId ? 'Edit Penyewa' : 'Tambah Penyewa Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            
            <form onSubmit={handleSimpan} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nama Pemilik</label>
                <input type="text" required value={formData.nama} onChange={(e) => setFormData({...formData, nama: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nama Perusahaan (Opsional)</label>
                <input type="text" value={formData.nama_perusahaan} onChange={(e) => setFormData({...formData, nama_perusahaan: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">No. HP (WhatsApp)</label>
                <input type="text" value={formData.nomor_hp} onChange={(e) => setFormData({...formData, nomor_hp: e.target.value})} placeholder="0812xxxx" className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Email (Kunci Login)</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} disabled={editingId !== null} className={`w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>

              {!editingId && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Password Sementara</label>
                  <input type="text" required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
              )}

              {pesan && (
                <div className={`p-3 rounded text-sm ${pesan.includes('Berhasil') ? 'bg-green-900/50 text-green-300 border border-green-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
                  {pesan}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded text-gray-300 hover:bg-gray-700 text-sm font-medium">Batal</button>
                <button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm disabled:opacity-50">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}