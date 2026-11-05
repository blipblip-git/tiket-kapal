// app/kapal/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Kapal = {
  id: string
  nama: string
  kapasitas: number
  layout_kursi: string
  status: 'aktif' | 'cadangan' | 'rusak'
  catatan: string | null
  foto_url: string | null
  nama_kapten: string | null
}

export default function ManajemenKapalPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [loading, setLoading] = useState(true)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  // State Modal
  const [modalTambah, setModalTambah] = useState(false)
  const [modalEdit, setModalEdit] = useState<Kapal | null>(null)
  
  const [inputNama, setInputNama] = useState('')
  const [inputKapasitas, setInputKapasitas] = useState('')
  const [inputLayout, setInputLayout] = useState('2-3')
  const [inputStatus, setInputStatus] = useState<'aktif' | 'cadangan' | 'rusak'>('aktif')
  const [inputCatatan, setInputCatatan] = useState('')
  const [inputKapten, setInputKapten] = useState('')
  const [inputFoto, setInputFoto] = useState<File | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    async function init() {
      // 1. Coba ambil dari Supabase Auth dulu
      let p = await getProfile()
      
      // 2. Jika gagal, coba dari localStorage
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          p = sesiLokal as unknown as Profile
        }
      }

      // 3. Jika dua-duanya kosong, baru tendang ke login
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      
      setProfile(p)
      await loadKapal()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadKapal() {
    const { data, error } = await supabase
      .from('kapal')
      .select('*')
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load kapal: ' + error.message })
      return
    }
    setKapalList((data || []) as Kapal[])
  }

  async function uploadFoto(file: File, namaKapal: string) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${namaKapal.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
    const filePath = `${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('kapal')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('kapal').getPublicUrl(filePath)
    return data.publicUrl
  }

  // ==================== TAMBAH ====================
  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    if (!inputNama || !inputKapasitas || !inputKapten) {
      setPesan({ tipe: 'err', teks: 'Nama, kapasitas, dan nama kapten wajib diisi.' })
      return
    }

    setModalLoading(true)
    let fotoUrl = null

    try {
      if (inputFoto) {
        fotoUrl = await uploadFoto(inputFoto, inputNama)
      }
    } catch (err: any) {
      setPesan({ tipe: 'err', teks: 'Gagal upload foto: ' + err.message })
      setModalLoading(false)
      return
    }

    const { error } = await supabase.from('kapal').insert({
      nama: inputNama,
      kapasitas: parseInt(inputKapasitas),
      layout_kursi: inputLayout,
      status: inputStatus,
      catatan: inputCatatan || null,
      nama_kapten: inputKapten,
      foto_url: fotoUrl,
    })

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal tambah: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: 'Kapal berhasil ditambahkan.' })
    setModalTambah(false)
    setInputNama(''); setInputKapasitas(''); setInputLayout('2-3'); setInputStatus('aktif'); setInputCatatan(''); setInputKapten(''); setInputFoto(null)
    await loadKapal()
  }

  // ==================== EDIT ====================
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!modalEdit) return
    setPesan(null)
    if (!inputNama || !inputKapasitas || !inputKapten) {
      setPesan({ tipe: 'err', teks: 'Nama, kapasitas, dan nama kapten wajib diisi.' })
      return
    }

    setModalLoading(true)
    let fotoUrl = modalEdit.foto_url

    try {
      if (inputFoto) {
        fotoUrl = await uploadFoto(inputFoto, inputNama)
      }
    } catch (err: any) {
      setPesan({ tipe: 'err', teks: 'Gagal upload foto: ' + err.message })
      setModalLoading(false)
      return
    }

    const { error } = await supabase
      .from('kapal')
      .update({
        nama: inputNama,
        kapasitas: parseInt(inputKapasitas),
        layout_kursi: inputLayout,
        status: inputStatus,
        catatan: inputCatatan || null,
        nama_kapten: inputKapten,
        foto_url: fotoUrl,
      })
      .eq('id', modalEdit.id)

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal edit: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: 'Kapal berhasil diupdate.' })
    setModalEdit(null)
    await loadKapal()
  }

  // ==================== HAPUS ====================
  async function handleHapus(target: Kapal) {
    if (!confirm(`Yakin mau hapus kapal ${target.nama}?\n\nPeringatan: Kalau ada jadwal terkait, sistem akan menolak.`)) return

    setAksiLoading(target.id)
    const { error } = await supabase.from('kapal').delete().eq('id', target.id)
    setAksiLoading(null)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal hapus: ' + error.message })
      return
    }
    setPesan({ tipe: 'ok', teks: 'Kapal berhasil dihapus.' })
    await loadKapal()
  }

  function bukaEdit(k: Kapal) {
    setModalEdit(k)
    setInputNama(k.nama)
    setInputKapasitas(k.kapasitas.toString())
    setInputLayout(k.layout_kursi)
    setInputStatus(k.status)
    setInputCatatan(k.catatan || '')
    setInputKapten(k.nama_kapten || '')
    setInputFoto(null)
  }

  const getStatusBadge = (status: string) => {
    if (status === 'aktif') return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Aktif</span>
    if (status === 'cadangan') return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Cadangan</span>
    return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Rusak</span>
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat data...</p>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manajemen Armada Kapal</h1>
            <p className="text-sm text-gray-500 mt-1">Kelola kapal aktif, cadangan, dan rusak.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setModalTambah(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm font-medium"
            >
              + Tambah Kapal
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline px-2">
              ← Kembali ke Dashboard
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-center px-4 py-3">Foto</th>
                <th className="text-left px-4 py-3">Nama Kapal</th>
                <th className="text-left px-4 py-3">Nama Kapten</th>
                <th className="text-center px-4 py-3">Kapasitas</th>
                <th className="text-center px-4 py-3">Layout</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {kapalList.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Belum ada data kapal.</td></tr>
              )}
              {kapalList.map((k) => (
                <tr key={k.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-center">
                    {k.foto_url ? (
                      <img src={k.foto_url} alt={k.nama} className="w-16 h-12 object-cover rounded mx-auto" />
                    ) : (
                      <span className="text-gray-400 text-xs">No Foto</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-800">{k.nama}</td>
                  <td className="px-4 py-3 text-gray-700">{k.nama_kapten || '-'}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{k.kapasitas} seat</td>
                  <td className="px-4 py-3 text-center text-gray-600">{k.layout_kursi}</td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(k.status)}</td>
                  <td className="px-4 py-3 text-center space-x-2">
                    <button onClick={() => bukaEdit(k)} className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-200">Edit</button>
                    <button onClick={() => handleHapus(k)} disabled={aksiLoading === k.id} className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs hover:bg-red-200">
                      {aksiLoading === k.id ? '...' : 'Hapus'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== MODAL TAMBAH ==================== */}
      {modalTambah && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Kapal Baru</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapal</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: Kapal A1" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapten</label>
              <input type="text" value={inputKapten} onChange={(e) => setInputKapten(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: Budi Santoso" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas (Seat)</label>
              <input type="number" value={inputKapasitas} onChange={(e) => setInputKapasitas(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: 60" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Foto Kapal</label>
              <input type="file" accept="image/*" onChange={(e) => setInputFoto(e.target.files ? e.target.files[0] : null)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900 text-sm" />

              <label className="block text-sm font-medium text-gray-700 mb-1">Layout Kursi</label>
              <select value={inputLayout} onChange={(e) => setInputLayout(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900">
                <option value="2-3">2-3 (2 kiri, 3 kanan)</option>
                <option value="2-2">2-2 (2 kiri, 2 kanan)</option>
                <option value="tanpa_layout">Tanpa Layout (Grid)</option>
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={inputStatus} onChange={(e) => setInputStatus(e.target.value as any)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900">
                <option value="aktif">Aktif (Siap Beroperasi)</option>
                <option value="cadangan">Cadangan (Standby)</option>
                <option value="rusak">Rusak (Tidak Bisa Dipakai)</option>
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (Opsional)</label>
              <input type="text" value={inputCatatan} onChange={(e) => setInputCatatan(e.target.value)} className="w-full border rounded px-3 py-2 mb-6 text-gray-900" placeholder="Misal: Mesin sedang diservis" />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalTambah(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
                  {modalLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL EDIT ==================== */}
      {modalEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Edit Kapal: {modalEdit.nama}</h3>
            <form onSubmit={handleEdit}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapal</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapten</label>
              <input type="text" value={inputKapten} onChange={(e) => setInputKapten(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas (Seat)</label>
              <input type="number" value={inputKapasitas} onChange={(e) => setInputKapasitas(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Ganti Foto (Opsional)</label>
              <input type="file" accept="image/*" onChange={(e) => setInputFoto(e.target.files ? e.target.files[0] : null)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900 text-sm" />
              {modalEdit.foto_url && !inputFoto && (
                <p className="text-xs text-gray-500 mb-3">Foto saat ini sudah terpasang.</p>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-1">Layout Kursi</label>
              <select value={inputLayout} onChange={(e) => setInputLayout(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900">
                <option value="2-3">2-3</option>
                <option value="2-2">2-2</option>
                <option value="tanpa_layout">Tanpa Layout</option>
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={inputStatus} onChange={(e) => setInputStatus(e.target.value as any)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900">
                <option value="aktif">Aktif</option>
                <option value="cadangan">Cadangan</option>
                <option value="rusak">Rusak</option>
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
              <input type="text" value={inputCatatan} onChange={(e) => setInputCatatan(e.target.value)} className="w-full border rounded px-3 py-2 mb-6 text-gray-900" />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalEdit(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
                  {modalLoading ? 'Menyimpan...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}