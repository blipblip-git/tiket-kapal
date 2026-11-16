'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Kapal = {
  id: string
  nama: string
  kapasitas: number
  layout_kursi: string | null
  status: string
  catatan: string | null
  foto_url: string | null
  nama_kapten: string | null
}

function KapalContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [loading, setLoading] = useState(true)
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nama, setNama] = useState('')
  const [kapasitas, setKapasitas] = useState('')
  const [layout, setLayout] = useState('tanpa_layout')
  const [namaKapten, setNamaKapten] = useState('')
  const [status, setStatus] = useState('aktif')
  const [catatan, setCatatan] = useState('')
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoLama, setFotoLama] = useState<string | null>(null)
  const [proses, setProses] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) { router.push('/login'); return }
      
      if (p.role !== 'admin_utama' && p.role !== 'superadmin') {
        setError('Anda tidak punya akses ke halaman ini')
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
    let query = supabase.from('kapal').select('*').order('nama')
    if (p.role !== 'superadmin') {
      query = query.eq('operator_id', p.id)
    }
    const { data } = await query
    setKapalList(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setEditId(null)
    setNama('')
    setKapasitas('')
    setLayout('tanpa_layout')
    setNamaKapten('')
    setStatus('aktif')
    setCatatan('')
    setFotoFile(null)
    setFotoLama(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEdit = (k: Kapal) => {
    setEditId(k.id)
    setNama(k.nama)
    setKapasitas(k.kapasitas.toString())
    setLayout(k.layout_kursi || 'tanpa_layout')
    setNamaKapten(k.nama_kapten || '')
    setStatus(k.status)
    setCatatan(k.catatan || '')
    setFotoLama(k.foto_url)
    setFotoFile(null)
    setShowForm(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleHapus = async (id: string) => {
    if (!confirm('Yakin mau hapus kapal ini? Data jadwal yang terhubung mungkin akan error.')) return
    setLoading(true)
    const { error } = await supabase.from('kapal').delete().eq('id', id)
    if (error) {
      alert('Gagal hapus: ' + error.message)
      setLoading(false)
      return
    }
    if (profile) fetchData(profile)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!nama || !kapasitas) {
      setError('Nama dan Kapasitas wajib diisi')
      return
    }

    setProses(true)
    setError('')

    try {
      let fotoUrl = fotoLama

      // Upload foto jika ada file baru
      if (fotoFile) {
        const fileExt = fotoFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('kapal')
          .upload(fileName, fotoFile)
        
        if (uploadError) throw new Error('Gagal upload foto: ' + uploadError.message)

        const { data: publicUrlData } = supabase.storage.from('kapal').getPublicUrl(fileName)
        fotoUrl = publicUrlData.publicUrl
      }

      const payload = {
        nama,
        kapasitas: parseInt(kapasitas),
        layout_kursi: layout,
        nama_kapten: namaKapten || null,
        status,
        catatan: catatan || null,
        foto_url: fotoUrl,
        operator_id: profile.role === 'superadmin' && !editId ? profile.id : (profile.role === 'admin_utama' ? profile.id : undefined)
      }

      if (editId) {
        const { error: errUpd } = await supabase.from('kapal').update(payload).eq('id', editId)
        if (errUpd) throw errUpd
      } else {
        const finalPayload = {
          ...payload,
          operator_id: profile.id
        }
        const { error: errIns } = await supabase.from('kapal').insert(finalPayload)
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

  if (loading && kapalList.length === 0) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error && kapalList.length === 0) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daftar Armada Kapal</h1>
            <p className="text-sm text-gray-600">Kelola data kapal dan kapten Anda</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { resetForm(); setShowForm(!showForm) }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Kapal'}
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
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Edit Kapal' : 'Tambah Kapal Baru'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapal</label>
                  <input type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: SB. Andalas 1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas Kursi</label>
                  <input type="number" value={kapasitas} onChange={e => setKapasitas(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: 60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapten</label>
                  <input type="text" value={namaKapten} onChange={e => setNamaKapten(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: Budi" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Layout Kursi</label>
                  <select value={layout} onChange={e => setLayout(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="tanpa_layout">Tanpa Layout (Grid)</option>
                    <option value="2-3">2 - 3 (Kiri 2, Kanan 3)</option>
                    <option value="2-2">2 - 2 (Kiri 2, Kanan 2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto Kapal (Opsional)</label>
                  <input type="file" accept="image/*" ref={fileInputRef} onChange={e => setFotoFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  {fotoLama && !fotoFile && <p className="text-xs text-green-600 mt-1">Foto lama terpasang.</p>}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (Opsional)</label>
                <textarea value={catatan} onChange={e => setCatatan(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" rows={2}></textarea>
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

        <div className="flex flex-col gap-3">
          {kapalList.map(k => (
            <div key={k.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row items-center gap-4">
              
              <div className="w-full md:w-auto flex-shrink-0">
                <span className={`inline-block text-xs px-3 py-1.5 rounded-md font-bold ${k.status === 'aktif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {k.status.toUpperCase()}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center w-full md:border-l md:border-gray-200 md:pl-4">
                <h3 className="font-bold text-lg text-gray-900 mb-1">{k.nama}</h3>
                <div className="text-sm text-gray-600 flex flex-col md:flex-row gap-2 md:gap-6">
                  <p>Kapasitas: <span className="font-medium text-gray-900">{k.kapasitas} Kursi</span></p>
                  <p>Kapten: <span className="font-medium text-gray-900">{k.nama_kapten || '-'}</span></p>
                  {k.catatan && <p className="italic text-xs self-end md:self-auto text-gray-400">"{k.catatan}"</p>}
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto items-center justify-end mt-2 md:mt-0">
                <button onClick={() => handleEdit(k)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded text-sm font-medium hover:bg-blue-100 transition-colors">Edit</button>
                <button onClick={() => handleHapus(k.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100 transition-colors">Hapus</button>
              </div>
            </div>
          ))}
        </div>

        {kapalList.length === 0 && !loading && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">Belum ada data kapal.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function KapalPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <KapalContent />
    </Suspense>
  )
}