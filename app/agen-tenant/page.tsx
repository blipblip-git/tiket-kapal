'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Agen = {
  id: string
  nama: string
  email: string
  password_plain: string
  nomor_hp: string | null
  lokasi: string | null
  aktif: boolean
}

// DAFTAR LOKASI DIPERBARUI: Mencakup semua rute di Kaltara
const DAFTAR_LOKASI = [
  'Tarakan', 
  'Tanjung Selor', 
  'Malinau', 
  'Nunukan', 
  'KTT', 
  'Bunyu', 
  'Sebatik', 
  'Sungai Nyamuk', 
  'Tanah Kuning'
]

export default function ManajemenAgenTenantPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [agenList, setAgenList] = useState<Agen[]>([])
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)

  // State Modal
  const [modalTambah, setModalTambah] = useState(false)
  const [modalEdit, setModalEdit] = useState<Agen | null>(null)
  
  const [inputNama, setInputNama] = useState('')
  const [inputHp, setInputHp] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputLokasi, setInputLokasi] = useState('Tarakan')
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }

      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }

      setProfile(p)
      await loadAgen(p.id)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadAgen(adminId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agen')
      .eq('dibuat_oleh', adminId)
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load agen: ' + error.message })
      return
    }
    setAgenList((data || []) as Agen[])
  }

  // ==================== TAMBAH ====================
  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    if (!inputNama || !inputHp || !inputPass || !profile) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, dan Password wajib diisi.' })
      return
    }

    setModalLoading(true)
    const v_email = inputHp + '@petugas.local'
    const v_user_id = crypto.randomUUID()

    const { error } = await supabase.from('profiles').insert({
      id: v_user_id, 
      email: v_email, 
      nama: inputNama, 
      role: 'agen', 
      lokasi: inputLokasi, 
      aktif: true, 
      password_plain: inputPass,
      nomor_hp: inputHp,
      dibuat_oleh: profile.id
    })

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal tambah: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: `Agen ${inputNama} berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputPass(''); setInputLokasi('Tarakan')
    await loadAgen(profile.id)
  }

  // ==================== EDIT ====================
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!modalEdit || !profile) return
    setPesan(null)
    if (!inputNama || !inputHp || !inputPass) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, dan Password wajib diisi.' })
      return
    }

    setModalLoading(true)
    const v_email = inputHp + '@petugas.local'

    const { error } = await supabase
      .from('profiles')
      .update({
        nama: inputNama,
        email: v_email,
        password_plain: inputPass,
        nomor_hp: inputHp,
        lokasi: inputLokasi
      })
      .eq('id', modalEdit.id)

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal edit: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: 'Data agen berhasil diupdate.' })
    setModalEdit(null)
    await loadAgen(profile.id)
  }

  // ==================== HAPUS ====================
  async function handleHapus(target: Agen) {
    if (!profile) return
    if (!confirm(`Yakin mau hapus agen ${target.nama}?`)) return

    setAksiLoading(target.id)
    const { error } = await supabase.from('profiles').delete().eq('id', target.id)
    setAksiLoading(null)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal hapus: ' + error.message })
      return
    }
    setPesan({ tipe: 'ok', teks: 'Agen berhasil dihapus.' })
    await loadAgen(profile.id)
  }

  function bukaEdit(a: Agen) {
    setModalEdit(a)
    setInputNama(a.nama)
    setInputHp(a.nomor_hp || a.email.replace('@petugas.local', ''))
    setInputPass(a.password_plain || '')
    setInputLokasi(a.lokasi || 'Tarakan')
  }

  function kirimWA(a: Agen) {
    let noHp = (a.nomor_hp || a.email.replace('@petugas.local', '')).replace(/\D/g, '')
    if (noHp.startsWith('0')) {
      noHp = '62' + noHp.slice(1)
    }
    const pesan = `Halo ${a.nama}, ini pesan dari Admin Kapal. Berikut informasi akun Agen Anda:\n\nNama Agen: ${a.nama}\nLogin (No HP): ${a.nomor_hp || a.email.replace('@petugas.local', '')}\nPassword: ${a.password_plain || '(belum di-set)'}\nLokasi: ${a.lokasi || '-'}\n\nSilakan login di menu Petugas/Agen.`
    const url = `https://wa.me/${noHp}?text=${encodeURIComponent(pesan)}`
    window.open(url, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manajemen Agen</h1>
            <p className="text-sm text-gray-500 mt-1">Buat akun agen yang bisa menjual tiket kapal Anda sesuai lokasi.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setModalTambah(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 text-sm font-bold"
            >
              + Tambah Agen
            </button>
            <button 
              onClick={() => router.push('/dashboard')} 
              className="text-sm text-blue-600 hover:underline px-2 font-medium"
            >
              &larr; Kembali ke Dashboard
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        {/* TABEL AGEN */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-4 py-3">Nama Agen</th>
                <th className="text-left px-4 py-3">No. HP / Pass</th>
                <th className="text-center px-4 py-3">Lokasi</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {agenList.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Belum ada agen terdaftar.</td></tr>
              )}
              {agenList.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-900">{a.nama}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{a.nomor_hp || a.email.replace('@petugas.local', '')}</div>
                    <div className="text-xs text-gray-500">{a.password_plain}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 font-bold">{a.lokasi || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {a.aktif ? (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktif</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Nonaktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center space-x-2">
                    <button onClick={() => kirimWA(a)} className="bg-green-100 text-green-700 px-3 py-1 rounded text-xs hover:bg-green-200 font-bold">WA</button>
                    <button onClick={() => bukaEdit(a)} className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs hover:bg-blue-200 font-bold">Edit</button>
                    <button onClick={() => handleHapus(a)} disabled={aksiLoading === a.id} className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs hover:bg-red-200 font-bold">
                      {aksiLoading === a.id ? '...' : 'Hapus'}
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
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Agen Baru</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Agen</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: Agen Loket 1" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP (Login)</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="0812..." required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Penempatan</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required>
                {DAFTAR_LOKASI.map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border rounded px-3 py-2 mb-6 text-gray-900" placeholder="Minimal 6 karakter" required />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalTambah(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 font-bold">
                  {modalLoading ? 'Menyimpan...' : 'Simpan Agen'}
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
            <h3 className="text-lg font-bold mb-4 text-gray-800">Edit Agen: {modalEdit.nama}</h3>
            <form onSubmit={handleEdit}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Agen</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Penempatan</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required>
                {DAFTAR_LOKASI.map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border rounded px-3 py-2 mb-6 text-gray-900" required />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalEdit(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-bold">
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