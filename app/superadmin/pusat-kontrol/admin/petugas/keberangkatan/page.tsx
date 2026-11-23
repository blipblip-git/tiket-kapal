'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'
import { validasiNomorHpUnik, pesanGagalSimpanAkun } from '@/lib/validasiAkun'
import { normalisasiNomorHp } from '@/lib/nomorHp'
import { useLokasiOperasional, pilihanLokasi } from '@/lib/lokasi'

type RoleType = 'terminal_keberangkatan'

// Pilihan "Lokasi Tugas" diambil dari Master Rute lewat lib/lokasi.ts (bukan daftar tetap).

export default function AdminPetugasPage() {
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
  const [inputRole] = useState<RoleType>('terminal_keberangkatan')
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

  // Lokasi dari Master Rute (master_kota + master_rute).
  const { lokasiList } = useLokasiOperasional()

  // Lokasi efektif untuk form tambah: pakai lokasi pertama Master Rute
  // kalau nilai default belum ada, tanpa setState di dalam effect.
  const inputLokasiForm = lokasiList.length === 0 || lokasiList.includes(inputLokasi)
    ? inputLokasi
    : lokasiList[0]

  useEffect(() => {
    async function init() {
      let profile = await getProfile()
      if (!profile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          profile = sesiLokal as unknown as Profile
        }
      }
      if (!profile) {
        router.push('/superadmin')
        return
      }
      
      // Ambil operator_id dari URL (jika Superadmin lagi ngetes), atau dari Profil (jika Admin asli)
      const urlParams = new URLSearchParams(window.location.search)
      const urlOperatorId = urlParams.get('operator')
      const targetOperatorId = urlOperatorId || profile.operator_id || profile.id

      // Simulasi profil "me" biar filter jalan
      setMe({ ...profile, operator_id: targetOperatorId, id: targetOperatorId } as Profile)
      
      await loadPetugas(targetOperatorId)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadPetugas(operatorId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'terminal_keberangkatan')
      .eq('operator_id', operatorId)
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load data: ' + error.message })
      return
    }
    setPetugas((data || []) as Profile[])
  }

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
      update.dinonaktifkan_oleh = me.nama
      update.waktu_dinonaktifkan = new Date().toISOString()
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', target.id)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
      setAksiLoading(null)
      return
    }

    setPesan({ tipe: 'ok', teks: `Akun ${target.nama} berhasil di${aksiBaru ? 'aktifkan' : 'nonaktifkan'}.` })
    await loadPetugas(me.id)
    setAksiLoading(null)
  }

  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    setPesan(null)
    if (!inputNama || !inputHp || !inputPass || !inputUnit) {
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

    const nomorHp = normalisasiNomorHp(inputHp)
    const v_user_id = crypto.randomUUID()

    // PERBAIKAN: Tidak pakai email lagi, email diset null
    const { error } = await supabase.from('profiles').insert({
      id: v_user_id, 
      email: null, 
      nomor_hp: nomorHp,
      nama: inputNama, 
      role: inputRole, 
      lokasi: inputLokasiForm,
      unit: inputUnit, 
      aktif: true, 
      ...(await fieldPasswordBaru(inputPass)),
      operator_id: me.id
    })

    setModalLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: `Operator ${inputNama} berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputPass(''); setInputLokasi('Tarakan'); setInputUnit('')
    await loadPetugas(me.id)
  }

  function mulaiEdit(p: Profile) {
    setEditId(p.id)
    setEditNama(p.nama)
    setEditHp(p.nomor_hp || '')
    setEditPass('') // password lama tidak bisa ditampilkan (sudah di-hash)
    setEditLokasi(p.lokasi || 'Tarakan')
    setEditUnit(p.unit || '')
    setPesan(null)
  }

  function batalEdit() {
    setEditId(null)
  }

  async function handleSimpanEdit(id: string) {
    if (!editNama || !editHp || !editUnit) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, dan Unit wajib diisi.' })
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
      nama: editNama,
      nomor_hp: normalisasiNomorHp(editHp),
      email: null,
      lokasi: editLokasi,
      unit: editUnit
    }

    // Password hanya diganti kalau kolomnya diisi.
    if (editPass) {
      Object.assign(updateData, await fieldPasswordBaru(editPass))
    }

    // PERBAIKAN: Update email jadi null, pakai nomor_hp
    const { error } = await supabase.from('profiles').update(updateData).eq('id', id)

    setEditLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: `Data ${editNama} berhasil diupdate.` })
    setEditId(null)
    if (me) await loadPetugas(me.id)
  }

  function kirimWA(p: Profile) {
    // PERBAIKAN: Ambil nomor dari nomor_hp, fallback ke email kalau ada
    let noHpMurni = p.nomor_hp ? p.nomor_hp.replace(/\D/g, '') : ''
    if (!noHpMurni && p.email) {
      noHpMurni = p.email.replace('@petugas.local', '').replace(/\D/g, '')
    }
    
    if (noHpMurni.startsWith('0')) {
      noHpMurni = '62' + noHpMurni.slice(1)
    }
    
    const pesan = `Halo ${p.nama}, ini pesan dari Admin. Berikut informasi akun Anda:\n\nNo HP: ${p.nomor_hp || noHpMurni}\nRole: Petugas Keberangkatan\nUnit: ${p.unit || '-'}\nLokasi: ${p.lokasi || '-'}\n\nPassword TIDAK dikirim lewat chat demi keamanan. Minta Admin mereset password bila lupa.`
    const url = `https://wa.me/${noHpMurni}?text=${encodeURIComponent(pesan)}`
    window.open(url, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-500">Memuat data operator…</p>

  // Satu tabel ringkas seperti Manajemen Agen. Lokasi tetap ditampilkan
  // sebagai kolom, jadi tidak perlu lagi kartu/header biru per lokasi.
  const petugasUrut = [...petugas].sort((a, b) => {
    const lokA = (a.lokasi || 'Tarakan').trim()
    const lokB = (b.lokasi || 'Tarakan').trim()
    if (lokA !== lokB) return lokA.localeCompare(lokB, 'id')
    return a.nama.localeCompare(b.nama, 'id')
  })

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex flex-wrap items-center gap-2">
              Manajemen Petugas
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full inline-flex items-center gap-1 border border-green-300 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Mode Pusat Kontrol
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Kelola akun petugas keberangkatan (Scan & Manifest) untuk kapal Anda.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setModalTambah(true)} className="flex-1 md:flex-none whitespace-nowrap bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm font-medium">
              + Tambah Petugas
            </button>
            <button onClick={() => router.push('/superadmin/pusat-kontrol/admin/petugas')} className="flex-1 md:flex-none whitespace-nowrap text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded shadow-sm font-medium">
              ← Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        {/* TABEL PETUGAS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  <th className="px-4 py-3 w-12">No</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">No. HP / Pass</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {petugasUrut.map((p, idx) => {
                  const isEditing = editId === p.id

                  if (isEditing) {
                    return (
                      <tr key={p.id} className="bg-yellow-50">
                        <td className="px-4 py-2 text-center font-bold text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={editNama} onChange={(e) => setEditNama(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" placeholder="Loket 1" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={editLokasi} onChange={(e) => setEditLokasi(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900">
                            {pilihanLokasi(lokasiList, editLokasi).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2 space-y-1">
                          <input type="tel" value={editHp} onChange={(e) => setEditHp(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" />
                          <input type="text" value={editPass} onChange={(e) => setEditPass(e.target.value)} className="w-full border rounded px-2 py-1 text-gray-900" placeholder="Kosongkan jika tidak ganti password" />
                        </td>
                        <td className="px-4 py-2 text-center text-gray-400">—</td>
                        <td className="px-4 py-2 text-center space-x-1 whitespace-nowrap">
                          <button onClick={() => handleSimpanEdit(p.id)} disabled={editLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 font-bold disabled:opacity-50">
                            {editLoading ? '...' : 'Simpan'}
                          </button>
                          <button onClick={batalEdit} disabled={editLoading} className="bg-gray-400 text-white px-3 py-1 rounded text-xs hover:bg-gray-500 disabled:opacity-50">
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
                      <td className="px-4 py-3 font-bold text-blue-700">{p.unit || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{(p.lokasi || 'Tarakan').trim()}</td>
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
                        <button onClick={() => kirimWA(p)} className="text-green-600 hover:underline font-medium" title="Kirim WA">WA</button>
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
          {petugasUrut.length === 0 && !loading && (
            <div className="text-center py-10">
              <p className="text-gray-500">Belum ada data petugas.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL TAMBAH */}
      {modalTambah && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Petugas</h3>
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="0823..." required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Unit (Wajib)</label>
              <input type="text" value={inputUnit} onChange={(e) => setInputUnit(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="Contoh: Terminal 1" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Tugas</label>
              <select value={inputLokasiForm} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required>
                {pilihanLokasi(lokasiList, inputLokasiForm).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
              </select>

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