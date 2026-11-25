'use client'

// app/superadmin/pusat-kontrol/admin/syahbandar/page.tsx
// MANAJEMEN AKUN SYAHBANDAR (khusus Superadmin).
//
// Kenapa khusus Superadmin: akun syahbandar adalah akun LINTAS PENYEWA
// (operator_id kosong) supaya satu akun bisa membuka manifest di semua daerah.
// Policy RLS `tulis_profil_insert` hanya mengizinkan Superadmin membuat profil
// tanpa operator_id; Admin Utama penyewa akan ditolak database.
//
// Halaman ini hanya mengelola AKUN LOGIN. Halaman manifest-nya ada di
// /syahbandar (masuk lewat /login, tab "Syahbandar").

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'
import { validasiNomorHpUnik, pesanGagalSimpanAkun } from '@/lib/validasiAkun'
import { normalisasiNomorHp } from '@/lib/nomorHp'

const URL_LOGIN = 'https://www.lintasair.com/login?tab=syahbandar'

export default function AdminSyahbandarPage() {
  const router = useRouter()
  const [me, setMe] = useState<Profile | null>(null)
  const [akun, setAkun] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [aksesDitolak, setAksesDitolak] = useState(false)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  // Form tambah
  const [modalTambah, setModalTambah] = useState(false)
  const [inputNama, setInputNama] = useState('')
  const [inputHp, setInputHp] = useState('')
  const [inputUnit, setInputUnit] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [modalLoading, setModalLoading] = useState(false)

  // Edit inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editHp, setEditHp] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editPass, setEditPass] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }

      const { data: profil } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profil || profil.role !== 'superadmin') {
        setAksesDitolak(true)
        setLoading(false)
        return
      }

      setMe(profil as Profile)
      await loadAkun()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadAkun() {
    // Akun syahbandar tidak difilter operator: semuanya milik platform.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'syahbandar')
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load data: ' + error.message })
      return
    }
    setAkun((data || []) as Profile[])
  }

  async function toggleAktif(target: Profile) {
    const aksiBaru = !target.aktif
    const konfirmasi = aksiBaru
      ? `Aktifkan kembali akun syahbandar ${target.nama}?`
      : `Nonaktifkan akun syahbandar ${target.nama}?\n\nAkun ini tidak akan bisa login lagi.`
    if (!confirm(konfirmasi)) return

    setAksiLoading(target.id)
    setPesan(null)

    const update: Record<string, unknown> = { aktif: aksiBaru }
    if (aksiBaru) {
      update.dinonaktifkan_oleh = null
      update.waktu_dinonaktifkan = null
    } else {
      update.dinonaktifkan_oleh = me?.nama || 'Superadmin'
      update.waktu_dinonaktifkan = new Date().toISOString()
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', target.id)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
      setAksiLoading(null)
      return
    }

    setPesan({ tipe: 'ok', teks: `Akun ${target.nama} berhasil di${aksiBaru ? 'aktifkan' : 'nonaktifkan'}.` })
    await loadAkun()
    setAksiLoading(null)
  }

  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    if (!inputNama.trim() || !inputHp.trim() || !inputUnit.trim() || !inputPass) {
      setPesan({ tipe: 'err', teks: 'Semua kolom wajib diisi.' })
      return
    }

    setModalLoading(true)
    const cekNomor = await validasiNomorHpUnik(inputHp)
    if (!cekNomor.ok) {
      setModalLoading(false)
      setPesan({ tipe: 'err', teks: cekNomor.pesan })
      return
    }

    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      email: null,
      nomor_hp: normalisasiNomorHp(inputHp),
      nama: inputNama.trim(),
      role: 'syahbandar',
      lokasi: null, // berlaku untuk SEMUA daerah, bukan satu pelabuhan
      unit: inputUnit.trim(),
      aktif: true,
      operator_id: null, // akun platform, bukan milik satu penyewa
      ...(await fieldPasswordBaru(inputPass)),
    })

    setModalLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: `Akun syahbandar ${inputNama} berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputUnit(''); setInputPass('')
    await loadAkun()
  }

  function mulaiEdit(p: Profile) {
    setEditId(p.id)
    setEditNama(p.nama)
    setEditHp(p.nomor_hp || '')
    setEditUnit(p.unit || '')
    setEditPass('') // password lama tidak bisa ditampilkan (sudah di-hash)
    setPesan(null)
  }

  async function handleSimpanEdit(id: string) {
    if (!editNama.trim() || !editHp.trim() || !editUnit.trim()) {
      setPesan({ tipe: 'err', teks: 'Nama, instansi, dan No HP wajib diisi.' })
      return
    }

    setEditLoading(true)

    const cekNomor = await validasiNomorHpUnik(editHp, id)
    if (!cekNomor.ok) {
      setEditLoading(false)
      setPesan({ tipe: 'err', teks: cekNomor.pesan })
      return
    }

    const updateData: Record<string, unknown> = {
      nama: editNama.trim(),
      nomor_hp: normalisasiNomorHp(editHp),
      unit: editUnit.trim(),
      email: null,
      lokasi: null,
      operator_id: null,
    }

    // Password hanya diganti kalau kolomnya diisi (dipakai sebagai reset password).
    if (editPass) {
      Object.assign(updateData, await fieldPasswordBaru(editPass))
    }

    const { error } = await supabase.from('profiles').update(updateData).eq('id', id)

    setEditLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({
      tipe: 'ok',
      teks: editPass
        ? `Data ${editNama} disimpan dan password baru sudah dipasang.`
        : `Data ${editNama} berhasil diupdate.`
    })
    setEditId(null)
    await loadAkun()
  }

  function kirimWA(p: Profile) {
    let noHpMurni = p.nomor_hp ? p.nomor_hp.replace(/\D/g, '') : ''
    if (noHpMurni.startsWith('0')) noHpMurni = '62' + noHpMurni.slice(1)

    // Password TIDAK pernah dikirim lewat chat. Sampaikan langsung/lisan.
    const isi = `Halo ${p.nama}, ini pesan dari Admin.\n\nAkun Syahbandar Anda sudah siap.\nLogin: ${URL_LOGIN}\nNo HP: ${p.nomor_hp || '-'}\nInstansi: ${p.unit || '-'}\n\nPassword TIDAK dikirim lewat chat demi keamanan. Minta Admin mereset password bila lupa.`
    window.open(`https://wa.me/${noHpMurni}?text=${encodeURIComponent(isi)}`, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-500">Memuat akun syahbandar…</p>
  if (aksesDitolak) return <p className="p-6 text-center text-red-600 mt-10">Akses ditolak. Halaman ini khusus Superadmin.</p>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex flex-wrap items-center gap-2">
              Akun Syahbandar
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full inline-flex items-center gap-1 border border-green-300 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Mode Pusat Kontrol
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Satu akun berlaku untuk semua daerah. Login lewat halaman Login (tab Syahbandar), bukan lewat menu ini.
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setModalTambah(true)} className="flex-1 md:flex-none whitespace-nowrap bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm font-medium">
              + Tambah Akun
            </button>
            <button onClick={() => router.push('/superadmin/pusat-kontrol')} className="flex-1 md:flex-none whitespace-nowrap text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded shadow-sm font-medium">
              ← Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  <th className="px-4 py-3 w-12">No</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Instansi</th>
                  <th className="px-4 py-3">No. HP / Pass</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {akun.map((p, idx) => {
                  const isEditing = editId === p.id

                  if (isEditing) {
                    return (
                      <tr key={p.id} className="bg-yellow-50">
                        <td className="px-4 py-2 text-center font-bold text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={editNama} onChange={(e) => setEditNama(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" placeholder="KSOP Tarakan" />
                        </td>
                        <td className="px-4 py-2 space-y-1">
                          <input type="tel" value={editHp} onChange={(e) => setEditHp(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" />
                          <input type="text" value={editPass} onChange={(e) => setEditPass(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" placeholder="Kosongkan jika tidak reset password" />
                        </td>
                        <td className="px-4 py-2 text-center text-gray-400">—</td>
                        <td className="px-4 py-2 text-center space-x-1 whitespace-nowrap">
                          <button onClick={() => handleSimpanEdit(p.id)} disabled={editLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 font-bold disabled:opacity-50">
                            {editLoading ? '...' : 'Simpan'}
                          </button>
                          <button onClick={() => setEditId(null)} disabled={editLoading} className="bg-gray-400 text-white px-3 py-1 rounded text-xs hover:bg-gray-500 disabled:opacity-50">
                            Batal
                          </button>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-center font-bold text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{p.nama}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.unit || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{p.nomor_hp || '-'}</div>
                        <div className="text-xs text-gray-400">{p.password_hash || p.password_plain ? '••••••••' : '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${p.aktif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {p.aktif ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button onClick={() => kirimWA(p)} className="text-green-600 hover:underline font-medium" title="Kirim info login lewat WA">WA</button>
                        <span className="text-gray-300 mx-2">|</span>
                        <button onClick={() => mulaiEdit(p)} className="text-blue-600 hover:underline font-medium">Edit</button>
                        <span className="text-gray-300 mx-2">|</span>
                        <button onClick={() => toggleAktif(p)} disabled={aksiLoading === p.id} className={p.aktif ? 'text-orange-600 hover:underline font-medium disabled:opacity-50' : 'text-green-600 hover:underline font-medium disabled:opacity-50'}>
                          {aksiLoading === p.id ? '...' : p.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {akun.length === 0 && !loading && (
            <div className="text-center py-10">
              <p className="text-gray-500">Belum ada akun syahbandar.</p>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Tips: kirim link <span className="font-mono">{URL_LOGIN}</span> dan sampaikan password secara langsung (bukan lewat WA/chat).
        </p>
      </div>

      {modalTambah && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Akun Syahbandar</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="0823..." required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Instansi</label>
              <input type="text" value={inputUnit} onChange={(e) => setInputUnit(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: KSOP Tarakan" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" value={inputPass} onChange={(e) => setInputPass(e.target.value)} className="w-full border rounded px-3 py-2 mb-1 text-gray-900" required />
              <p className="text-[11px] text-gray-500 mb-4">Catat password ini dan serahkan langsung ke petugas syahbandar.</p>

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
