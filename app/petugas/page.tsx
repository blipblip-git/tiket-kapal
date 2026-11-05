// app/petugas/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type RoleType = 'terminal_keberangkatan'

const DAFTAR_LOKASI = ['Tarakan', 'Tanjung Selor', 'Malinau', 'Nunukan', 'KTT', 'Bunyu']

export default function PetugasPage() {
  const router = useRouter()
  const [me, setMe] = useState<Profile | null>(null)
  const [petugas, setPetugas] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  // State buat form tambah
  const [modalTambah, setModalTambah] = useState(false)
  const [inputNama, setInputNama] = useState('')
  const [inputHp, setInputHp] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputRole] = useState<RoleType>('terminal_keberangkatan') // Terkunci
  const [inputLokasi, setInputLokasi] = useState('Tarakan')
  const [inputUnit, setInputUnit] = useState('')
  const [modalLoading, setModalLoading] = useState(false)

  // State buat edit inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editHp, setEditHp] = useState('')
  const [editPass, setEditPass] = useState('')
  const [editLokasi, setEditLokasi] = useState('Tarakan')
  const [editUnit, setEditUnit] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // ==================== LOAD AWAL ====================
  useEffect(() => {
    async function init() {
      // 1. Coba ambil dari Supabase Auth dulu (cara lama)
      let profile = await getProfile()

      // 2. Jika gagal, coba ambil dari localStorage (cara baru)
      if (!profile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          profile = sesiLokal as unknown as Profile
        }
      }

      if (!profile) {
        router.push('/login')
        return
      }
      if (profile.role !== 'admin_utama') {
        router.push('/dashboard')
        return
      }
      setMe(profile)
      await loadPetugas()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadPetugas() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'terminal_keberangkatan') // HANYA AMBIL KEBERANGKATAN
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load data: ' + error.message })
      return
    }
    setPetugas((data || []) as Profile[])
  }

  // ==================== AKSI AKTIF / NONAKTIF ====================
  async function toggleAktif(target: Profile) {
    if (!me) return
    const aksiBaru = !target.aktif
    const konfirmasi = aksiBaru
      ? `Aktifkan kembali operator ${target.nama}?`
      : `Nonaktifkan operator ${target.nama}?\n\nAkun ini tidak akan bisa login lagi.`
    if (!confirm(konfirmasi)) return

    setAksiLoading(target.id)
    setPesan(null)

    const update: Record<string, unknown> = { aktif: aksiBaru }
    if (aksiBaru) {
      update.dinonaktifkan_oleh = null
      update.waktu_dinonaktifkan = null
    } else {
      update.dinonaktifkan_oleh = me.email
      update.waktu_dinonaktifkan = new Date().toISOString()
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', target.id)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
      setAksiLoading(null)
      return
    }

    setPesan({ tipe: 'ok', teks: `Akun ${target.nama} berhasil di${aksiBaru ? 'aktifkan' : 'nonaktifkan'}.` })
    await loadPetugas()
    setAksiLoading(null)
  }

  // ==================== TAMBAH OPERATOR ====================
  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    if (!inputNama || !inputHp || !inputPass || !inputUnit) {
      setPesan({ tipe: 'err', teks: 'Semua kolom wajib diisi.' })
      return
    }

    setModalLoading(true)
    const v_email = inputHp + '@petugas.local'
    const v_user_id = crypto.randomUUID()

    const { error } = await supabase.from('profiles').insert({
      id: v_user_id, email: v_email, nama: inputNama, role: inputRole, lokasi: inputLokasi, unit: inputUnit, aktif: true, password_plain: inputPass
    })

    setModalLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal simpan: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: `Operator ${inputNama} berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputPass(''); setInputLokasi('Tarakan'); setInputUnit('')
    await loadPetugas()
  }

  // ==================== EDIT INLINE ====================
  function mulaiEdit(p: Profile) {
    setEditId(p.id)
    setEditNama(p.nama)
    setEditHp(p.email.replace('@petugas.local', ''))
    setEditPass(p.password_plain || '')
    setEditLokasi((p as any).lokasi || 'Tarakan')
    setEditUnit((p as any).unit || '')
    setPesan(null)
  }

  function batalEdit() {
    setEditId(null)
  }

  async function handleSimpanEdit(id: string) {
    if (!editNama || !editHp || !editPass || !editUnit) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, Password, dan Unit wajib diisi.' })
      return
    }

    setEditLoading(true)
    const v_email = editHp + '@petugas.local'

    const { error } = await supabase.from('profiles').update({
      nama: editNama, email: v_email, lokasi: editLokasi, unit: editUnit, password_plain: editPass
    }).eq('id', id)

    setEditLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: `Data ${editNama} berhasil diupdate.` })
    setEditId(null)
    await loadPetugas()
  }

  // ==================== KIRIM WA ====================
  function kirimWA(p: Profile) {
    let noHp = p.email.replace('@petugas.local', '').replace(/\D/g, '')
    if (noHp.startsWith('0')) {
      noHp = '62' + noHp.slice(1)
    }
    const pesan = `Halo ${p.nama}, ini pesan dari Admin. Berikut informasi akun Anda:\n\nNo HP: ${p.email.replace('@petugas.local', '')}\nPassword: ${p.password_plain || '(belum di-set)'}\nRole: Operator Keberangkatan\nUnit: ${(p as any).unit || '-'}\nLokasi: ${(p as any).lokasi}\n\nSilakan login dan jangan bagikan password ini.`
    const url = `https://wa.me/${noHp}?text=${encodeURIComponent(pesan)}`
    window.open(url, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-500">Memuat data operator…</p>

  const petugasPerLokasi = DAFTAR_LOKASI.map((lok) => ({
    lokasi: lok,
    data: petugas.filter((p) => ((p as any).lokasi || 'Tarakan') === lok),
  })).filter((grup) => grup.data.length > 0)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              Manajemen Operator Keberangkatan
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1 border border-green-300">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Admin Utama: ON (Anda)
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Kelola akun operator keberangkatan (Scan & Manifest) untuk kapal Anda.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModalTambah(true)} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm font-medium">
              + Tambah Operator
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline px-2">
              ← Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        {/* TABEL PER LOKASI */}
        {petugasPerLokasi.length === 0 ? (
          <div className="bg-white p-8 text-center text-gray-500 rounded shadow">Belum ada data operator keberangkatan.</div>
        ) : (
          petugasPerLokasi.map((grup) => (
            <div key={grup.lokasi} className="mb-8 bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-blue-600 px-4 py-3 border-b">
                <h2 className="text-white font-bold">📍 Lokasi: {grup.lokasi}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 w-12">No</th>
                    <th className="text-left px-4 py-3">Nama</th>
                    <th className="text-left px-4 py-3">Unit</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">No. HP / Pass</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {grup.data.map((p, idx) => {
                    const isEditing = editId === p.id

                    if (isEditing) {
                      return (
                        <tr key={p.id} className="bg-yellow-50 border-t border-yellow-200">
                          <td className="px-4 py-2 text-center font-bold">{idx + 1}</td>
                          <td className="px-4 py-2"><input type="text" value={editNama} onChange={(e) => setEditNama(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" /></td>
                          <td className="px-4 py-2"><input type="text" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" placeholder="Loket 1" /></td>
                          <td className="px-4 py-2 text-gray-600 font-medium">Operator Keberangkatan</td>
                          <td className="px-4 py-2 space-y-1">
                             <input type="tel" value={editHp} onChange={(e) => setEditHp(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" />
                             <input type="text" value={editPass} onChange={(e) => setEditPass(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <select value={editLokasi} onChange={(e) => setEditLokasi(e.target.value)} className="border rounded px-2 py-1 text-gray-900 w-full">
                              {DAFTAR_LOKASI.map((lok) => <option key={lok} value={lok}>{lok}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-center space-x-1 whitespace-nowrap">
                            <button onClick={() => handleSimpanEdit(p.id)} disabled={editLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 font-bold">
                              {editLoading ? '...' : 'Simpan'}
                            </button>
                            <button onClick={batalEdit} disabled={editLoading} className="bg-gray-400 text-white px-3 py-1 rounded text-xs hover:bg-gray-500">
                              Batal
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-center font-bold text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.nama}</td>
                        <td className="px-4 py-3 font-bold text-blue-700">{(p as any).unit || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">Operator Keberangkatan</td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>{p.email.replace('@petugas.local', '')}</div>
                          <div className="text-xs text-gray-400">{p.password_plain || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.aktif ? (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktif</span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Nonaktif</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                          <button onClick={() => kirimWA(p)} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs hover:bg-green-200 font-medium" title="Kirim WA">
                            WA
                          </button>
                          <button onClick={() => mulaiEdit(p)} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200">
                            Edit
                          </button>
                          <button onClick={() => toggleAktif(p)} className={`px-2 py-1 rounded text-xs ${p.aktif ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                            {p.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* ==================== MODAL TAMBAH ==================== */}
      {modalTambah && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Operator Keberangkatan</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="0823..." required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Unit (Wajib)</label>
              <input type="text" value={inputUnit} onChange={(e) => setInputUnit(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: Terminal 1" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Tugas</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required>
                {DAFTAR_LOKASI.map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">Role / Jabatan</label>
              <input type="text" value="Operator Keberangkatan" disabled className="w-full border rounded px-3 py-2 mb-3 text-gray-500 bg-gray-100" />

              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900" required />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalTambah(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400">
                  {modalLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}