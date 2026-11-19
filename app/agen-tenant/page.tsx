'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'

type Agen = {
  id: string
  nama: string
  email: string
  nomor_hp: string
  lokasi: string
  aktif: boolean
  password_hash?: string | null
  password_plain?: string | null
}

function AgenTenantContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [agenList, setAgenList] = useState<Agen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  
  // Form state
  const [nama, setNama] = useState('')
  const [nomorHp, setNomorHp] = useState('')
  const [lokasi, setLokasi] = useState('Tarakan')
  const [password, setPassword] = useState('')
  const [aktif, setAktif] = useState(true)
  
  const [proses, setProses] = useState(false)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) { router.push('/login'); return }
      if (p.role !== 'admin_utama' && p.role !== 'superadmin') {
        setError('Anda tidak punya akses')
        setLoading(false)
        return
      }
      setProfile(p)
      fetchData(p)
    }
    init()
  }, [router])

  async function fetchData(p: Profile) {
    setLoading(true)
    let query = supabase.from('profiles').select('*').eq('role', 'agen').order('nama')
    if (p.role !== 'superadmin') {
      query = query.eq('operator_id', p.id)
    }
    const { data, error: err } = await query
    if (err) {
      setError('Gagal mengambil data: ' + err.message)
    } else {
      setAgenList(data || [])
    }
    setLoading(false)
  }

  const resetForm = () => {
    setEditId(null)
    setNama('')
    setNomorHp('')
    setLokasi('Tarakan')
    setPassword('')
    setAktif(true)
    setError('')
  }

  const handleEdit = (a: Agen) => {
    setEditId(a.id)
    setNama(a.nama)
    setNomorHp(a.nomor_hp || '')
    setLokasi(a.lokasi || 'Tarakan')
    setPassword('') // password lama tidak bisa ditampilkan (sudah di-hash)
    setAktif(a.aktif)
    setShowForm(true)
  }

  const handleHapus = async (id: string) => {
    if (!confirm('Yakin mau hapus agen ini? Data penjualan agen ini mungkin akan terpengaruh.')) return
    setLoading(true)
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) {
      alert('Gagal hapus: ' + error.message)
    }
    if (profile) fetchData(profile)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!nama || !nomorHp || (!editId && !password)) {
      setError('Nama, No HP, dan Password wajib diisi')
      return
    }

    setProses(true)
    setError('')

    try {
      const payload: Record<string, any> = {
        id: crypto.randomUUID(), // Generate UUID otomatis
        nama,
        nomor_hp: nomorHp,
        lokasi,
        role: 'agen',
        aktif,
        operator_id: profile.id
      }

      // Password disimpan sebagai hash. Saat edit, kolom password dikosongkan
      // berarti password lama TIDAK diubah.
      if (password) {
        Object.assign(payload, await fieldPasswordBaru(password))
      }

      if (editId) {
        const { id, ...updatePayload } = payload 
        const { error: errUpd } = await supabase.from('profiles').update(updatePayload).eq('id', editId)
        if (errUpd) throw errUpd
      } else {
        const { error: errIns } = await supabase.from('profiles').insert(payload)
        if (errIns) throw errIns
      }

      setShowForm(false)
      resetForm()
      fetchData(profile)
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setProses(false)
    }
  }

  if (loading && agenList.length === 0) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error && agenList.length === 0) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manajemen Agen</h1>
            <p className="text-sm text-gray-600">Kelola akun agen penjualan tiket</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => { resetForm(); setShowForm(!showForm) }}
              className="flex-1 md:flex-none bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Agen'}
            </button>
            <button 
              onClick={() => router.push('/dashboard')} 
              className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors shadow-sm font-medium"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Edit Agen' : 'Tambah Agen Baru'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Agen *</label>
                  <input type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-purple-500 focus:border-purple-500" placeholder="Contoh: Agen ABC" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP (Login) *</label>
                  <input type="text" value={nomorHp} onChange={e => setNomorHp(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-purple-500 focus:border-purple-500" placeholder="0812..." required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-purple-500 focus:border-purple-500" placeholder={editId ? 'Kosongkan jika tidak ganti password' : 'Password untuk login'} required={!editId} />
                  {editId && <p className="text-xs text-gray-500 mt-1">Password lama tidak bisa dilihat. Isi hanya kalau mau mengganti.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Operasional</label>
                  <select value={lokasi} onChange={e => setLokasi(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-purple-500 focus:border-purple-500">
                    <option value="Tarakan">Tarakan</option>
                    <option value="Tanjung Selor">Tanjung Selor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={aktif ? 'aktif' : 'nonaktif'} onChange={e => setAktif(e.target.value === 'aktif')} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-purple-500 focus:border-purple-500">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Batal</button>
                <button type="submit" disabled={proses} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                  {proses ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  <th className="px-4 py-3">Nama Agen</th>
                  <th className="px-4 py-3">Nomor HP</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agenList.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">{a.nama}</td>
                    <td className="px-4 py-3 text-gray-900">{a.nomor_hp}</td>
                    {/* PERBAIKAN: Warna teks lokasi digelapin */}
                    <td className="px-4 py-3 font-medium text-gray-900">{a.lokasi}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${a.aktif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {a.aktif ? 'AKTIF' : 'NONAKTIF'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => handleEdit(a)} className="text-blue-600 hover:underline font-medium">Edit</button>
                      <button onClick={() => handleHapus(a.id)} className="text-red-600 hover:underline font-medium">Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agenList.length === 0 && !loading && (
            <div className="text-center py-10">
              <p className="text-gray-500">Belum ada data agen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AgenTenantPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <AgenTenantContent />
    </Suspense>
  )
}