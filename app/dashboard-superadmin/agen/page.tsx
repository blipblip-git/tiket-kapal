'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'
import { validasiNomorHpUnik, pesanGagalSimpanAkun } from '@/lib/validasiAkun'
import { normalisasiNomorHp } from '@/lib/nomorHp'
import { useLokasiOperasional, pilihanLokasi } from '@/lib/lokasi'

type Agen = {
  id: string
  nama: string
  email: string
  password_hash?: string | null
  password_plain?: string | null
  nomor_hp: string | null
  lokasi: string | null
  operator_id: string | null
  aktif: boolean
}

type Tenan = {
  id: string
  nama: string
  nama_perusahaan: string | null
}

// Pilihan "Lokasi Tugas" diambil dari Master Rute lewat lib/lokasi.ts (bukan daftar tetap).

export default function ManajemenAgenPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [agenList, setAgenList] = useState<Agen[]>([])
  const [tenanList, setTenanList] = useState<Tenan[]>([])
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)

  // State Modal
  const [modalTambah, setModalTambah] = useState(false)
  const [modalEdit, setModalEdit] = useState<Agen | null>(null)
  
  const [inputNama, setInputNama] = useState('')
  const [inputHp, setInputHp] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputLokasi, setInputLokasi] = useState('Tarakan')
  const [inputTenant, setInputTenant] = useState('')
  const [modalLoading, setModalLoading] = useState(false)

  // Lokasi dari Master Rute (master_kota + master_rute).
  const { lokasiList } = useLokasiOperasional()

  // Form baru: kalau lokasi awal tidak ada di Master Rute, pakai yang pertama.
  useEffect(() => {
    if (modalEdit) return
    if (lokasiList.length === 0) return
    if (!lokasiList.includes(inputLokasi)) setInputLokasi(lokasiList[0])
  }, [lokasiList, inputLokasi, modalEdit])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/superadmin')
        return
      }

      const { data: p, error: errP } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (errP || !p) {
        setError('Gagal memuat profil Superadmin.')
        setLoading(false)
        return
      }

      if (p.role !== 'admin_utama') {
        await supabase.auth.signOut()
        router.push('/superadmin')
        return
      }

      setProfile(p as Profile)
      await Promise.all([loadAgen(), loadTenan()])
      setLoading(false)
    }
    init()
  }, [router])

  async function loadAgen() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agen')
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load agen: ' + error.message })
      return
    }
    setAgenList((data || []) as Agen[])
  }

  async function loadTenan() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama, nama_perusahaan')
      .eq('role', 'admin_utama')
      .neq('email', 'superadmin@gmail.com')
      .order('nama_perusahaan', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load daftar penyewa: ' + error.message })
      return
    }
    setTenanList((data || []) as Tenan[])
  }

  function namaTenan(id: string | null) {
    if (!id) return 'Tanpa penyewa'
    const t = tenanList.find((x) => x.id === id)
    return t ? (t.nama_perusahaan || t.nama) : 'Penyewa tidak ditemukan'
  }

  // ==================== TAMBAH ====================
  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    if (!inputNama || !inputHp || !inputPass) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, dan Password wajib diisi.' })
      return
    }
    if (!inputTenant) {
      setPesan({ tipe: 'err', teks: 'Pilih perusahaan penyewa dulu. Agen wajib terikat ke satu penyewa.' })
      return
    }

    setModalLoading(true)
    const cekNomor = await validasiNomorHpUnik(inputHp)
    if (!cekNomor.ok) {
      setModalLoading(false)
      setPesan({ tipe: 'err', teks: cekNomor.pesan })
      return
    }

    const nomorHp = normalisasiNomorHp(inputHp)
    const v_email = nomorHp + '@petugas.local'
    const v_user_id = crypto.randomUUID()

    const { error } = await supabase.from('profiles').insert({
      id: v_user_id, 
      email: v_email, 
      nama: inputNama, 
      role: 'agen', 
      lokasi: inputLokasi, 
      aktif: true, 
      ...(await fieldPasswordBaru(inputPass)),
      nomor_hp: nomorHp,
      operator_id: inputTenant
    })

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: `Agen ${inputNama} berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputPass(''); setInputLokasi('Tarakan')
    await loadAgen()
  }

  // ==================== EDIT ====================
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!modalEdit) return
    setPesan(null)
    if (!inputNama || !inputHp) {
      setPesan({ tipe: 'err', teks: 'Nama dan No HP wajib diisi.' })
      return
    }

    setModalLoading(true)
    const cekNomor = await validasiNomorHpUnik(inputHp, modalEdit.id)
    if (!cekNomor.ok) {
      setModalLoading(false)
      setPesan({ tipe: 'err', teks: cekNomor.pesan })
      return
    }

    const nomorHp = normalisasiNomorHp(inputHp)
    const v_email = nomorHp + '@petugas.local'

    const updateData: Record<string, any> = {
      nama: inputNama,
      email: v_email,
      lokasi: inputLokasi,
      nomor_hp: nomorHp
    }

    // Agen wajib terikat ke satu penyewa.
    if (inputTenant) updateData.operator_id = inputTenant

    // Password hanya diganti kalau kolomnya diisi.
    if (inputPass) {
      Object.assign(updateData, await fieldPasswordBaru(inputPass))
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', modalEdit.id)

    setModalLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: 'Data agen berhasil diupdate.' })
    setModalEdit(null)
    await loadAgen()
  }

  // ==================== HAPUS ====================
  async function handleHapus(target: Agen) {
    if (!confirm(`Yakin mau hapus agen ${target.nama}?`)) return

    setAksiLoading(target.id)
    const { error } = await supabase.from('profiles').delete().eq('id', target.id)
    setAksiLoading(null)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal hapus: ' + error.message })
      return
    }
    setPesan({ tipe: 'ok', teks: 'Agen berhasil dihapus.' })
    await loadAgen()
  }

  function bukaEdit(a: Agen) {
    setModalEdit(a)
    setInputNama(a.nama)
    setInputHp(a.nomor_hp || a.email.replace('@petugas.local', ''))
    setInputPass('') // password lama tidak bisa ditampilkan (sudah di-hash)
    setInputLokasi(a.lokasi || 'Tarakan')
    setInputTenant(a.operator_id || '')
  }

  function kirimWA(a: Agen) {
    let noHp = (a.nomor_hp || a.email.replace('@petugas.local', '')).replace(/\D/g, '')
    if (noHp.startsWith('0')) {
      noHp = '62' + noHp.slice(1)
    }
    const pesan = `Halo ${a.nama}, ini pesan dari Admin Platform. Berikut informasi akun Agen Anda:\n\nNama Agen: ${a.nama}\nLogin (No HP): ${a.nomor_hp || a.email.replace('@petugas.local', '')}\n\nPassword TIDAK bisa dikirim lewat chat demi keamanan. Silakan hubungi Admin Platform untuk reset password bila lupa.`
    const url = `https://wa.me/${noHp}?text=${encodeURIComponent(pesan)}`
    window.open(url, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <div>
            <h1 className="text-2xl font-bold tracking-wider">MANAJEMEN AGEN</h1>
            <p className="text-sm text-gray-400 mt-1">Kelola akun agen khusus penjualan offline.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setInputNama('')
                setInputHp('')
                setInputPass('')
                setInputLokasi('Tarakan')
                setInputTenant('')
                setPesan(null)
                setModalTambah(true)
              }}
              className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm font-bold"
            >
              + Tambah Agen
            </button>
            <button 
              onClick={() => router.push('/dashboard-superadmin')} 
              className="text-sm bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-500 font-bold"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-900 text-green-200 border border-green-700' : 'bg-red-900 text-red-200 border border-red-700'}`}>
            {pesan.teks}
          </div>
        )}

        {/* TABEL AGEN */}
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="text-left px-4 py-3">Nama Agen</th>
                <th className="text-left px-4 py-3">Penyewa</th>
                <th className="text-left px-4 py-3">No. HP / Pass</th>
                <th className="text-center px-4 py-3">Lokasi</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {agenList.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500">Belum ada agen terdaftar.</td></tr>
              )}
              {agenList.map((a) => (
                <tr key={a.id} className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="px-4 py-3 font-bold text-white">{a.nama}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {a.operator_id ? namaTenan(a.operator_id) : (
                      <span className="text-red-400 text-xs font-bold">Tanpa penyewa</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    <div>{a.nomor_hp || a.email.replace('@petugas.local', '')}</div>
                    <div className="text-xs text-gray-500">{a.password_hash || a.password_plain ? '•••••••• (tersimpan aman)' : '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-300">{a.lokasi || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {a.aktif ? (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700">Aktif</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-red-900 text-red-300 border border-red-700">Nonaktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center space-x-2">
                    <button onClick={() => kirimWA(a)} className="bg-green-800 text-green-200 px-3 py-1 rounded text-xs hover:bg-green-700 font-bold">WA</button>
                    <button onClick={() => bukaEdit(a)} className="bg-blue-800 text-blue-200 px-3 py-1 rounded text-xs hover:bg-blue-700 font-bold">Edit</button>
                    <button onClick={() => handleHapus(a)} disabled={aksiLoading === a.id} className="bg-red-800 text-red-200 px-3 py-1 rounded text-xs hover:bg-red-700 font-bold">
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-sm w-full p-6 text-white">
            <h3 className="text-lg font-bold mb-4">Tambah Agen Baru</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-300 mb-1">Perusahaan Penyewa</label>
              <select value={inputTenant} onChange={(e) => setInputTenant(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required>
                <option value="">-- Pilih Penyewa --</option>
                {tenanList.map((t) => <option key={t.id} value={t.id}>{t.nama_perusahaan || t.nama}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-300 mb-1">Nama Agen</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" placeholder="Contoh: Agen Loket Tarakan" required />

              <label className="block text-sm font-medium text-gray-300 mb-1">Nomor HP (Login)</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" placeholder="0812..." required />

              <label className="block text-sm font-medium text-gray-300 mb-1">Lokasi Tugas</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required>
                {pilihanLokasi(lokasiList, inputLokasi).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-6 text-white focus:outline-none focus:border-blue-500" placeholder="Minimal 6 karakter" required />

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalTambah(false)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-500 font-bold">
                  {modalLoading ? 'Menyimpan...' : 'Simpan Agen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL EDIT ==================== */}
      {modalEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-sm w-full p-6 text-white">
            <h3 className="text-lg font-bold mb-4">Edit Agen: {modalEdit.nama}</h3>
            <form onSubmit={handleEdit}>
              <label className="block text-sm font-medium text-gray-300 mb-1">Perusahaan Penyewa</label>
              <select value={inputTenant} onChange={(e) => setInputTenant(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required>
                <option value="">-- Pilih Penyewa --</option>
                {tenanList.map((t) => <option key={t.id} value={t.id}>{t.nama_perusahaan || t.nama}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-300 mb-1">Nama Agen</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required />

              <label className="block text-sm font-medium text-gray-300 mb-1">Nomor HP</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required />

              <label className="block text-sm font-medium text-gray-300 mb-1">Lokasi Tugas</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-3 text-white focus:outline-none focus:border-blue-500" required>
                {pilihanLokasi(lokasiList, inputLokasi).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border border-gray-600 rounded bg-gray-700 px-3 py-2 mb-6 text-white focus:outline-none focus:border-blue-500" placeholder="Kosongkan jika tidak ganti password" />
              <p className="text-xs text-gray-400 -mt-5 mb-4">Password lama tidak bisa dilihat. Isi hanya kalau mau mengganti.</p>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalEdit(null)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded">Batal</button>
                <button type="submit" disabled={modalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-500 font-bold">
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