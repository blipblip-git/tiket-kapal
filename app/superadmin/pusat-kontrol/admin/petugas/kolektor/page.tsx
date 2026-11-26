'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'
import { validasiNomorHpUnik, pesanGagalSimpanAkun } from '@/lib/validasiAkun'
import { normalisasiNomorHp } from '@/lib/nomorHp'
import { UNIT_KOLEKTOR, adalahKolektor } from '@/lib/kolektor'
import { useLokasiOperasional, pilihanLokasi } from '@/lib/lokasi'

// Kolektor = akun penagih uang cash dari agen & petugas DI LOKASI YANG SAMA.
// Akun ini hanya bisa membuka Laporan Penjualan Harian (read-only) dan cetak.
export default function AdminPetugasKolektorPage() {
  const router = useRouter()
  const [me, setMe] = useState<Profile | null>(null)
  const [kolektor, setKolektor] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [aksesDitolak, setAksesDitolak] = useState(false)
  const [aksiLoading, setAksiLoading] = useState<string | null>(null)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  // Form tambah
  const [modalTambah, setModalTambah] = useState(false)
  const [inputNama, setInputNama] = useState('')
  const [inputHp, setInputHp] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputLokasi, setInputLokasi] = useState('Tarakan')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalPesan, setModalPesan] = useState<string | null>(null)

  // Edit inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editHp, setEditHp] = useState('')
  const [editPass, setEditPass] = useState('')
  const [editLokasi, setEditLokasi] = useState('Tarakan')
  const [editLoading, setEditLoading] = useState(false)

  // Lokasi dari Master Rute (master_kota + master_rute).
  const { lokasiList } = useLokasiOperasional()

  // Form tambah: pakai lokasi pertama Master Rute kalau default tidak ada di sana.
  useEffect(() => {
    if (lokasiList.length === 0) return
    if (!lokasiList.includes(inputLokasi)) setInputLokasi(lokasiList[0])
  }, [lokasiList, inputLokasi])

  useEffect(() => {
    async function init() {
      let profile = await getProfile()
      if (!profile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) profile = sesiLokal as unknown as Profile
      }
      if (!profile) {
        router.push('/superadmin')
        return
      }

      // Halaman ini hanya untuk Admin Utama penyewa (akun petugas = akun tenant).
      // Kolektor, petugas, agen, dan Superadmin tidak boleh membuka manajemen akun.
      const role = (profile.role || '').trim().toLowerCase()
      if (role !== 'admin_utama') {
        setAksesDitolak(true)
        setPesan({ tipe: 'err', teks: 'Akses ditolak. Halaman ini hanya untuk Admin Utama penyewa.' })
        setLoading(false)
        return
      }

      const targetOperatorId = profile.operator_id || profile.id

      setMe({ ...profile, operator_id: targetOperatorId, id: targetOperatorId } as Profile)
      await loadKolektor(targetOperatorId)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadKolektor(operatorId: string) {
    // Akun kolektor bisa tersimpan dengan role 'kolektor' (database sudah
    // di-update) atau role 'petugas_loket' + unit "Kolektor" (database lama).
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`role.eq.kolektor,and(role.eq.petugas_loket,unit.eq.${UNIT_KOLEKTOR})`)
      .eq('operator_id', operatorId)
      .order('nama', { ascending: true })

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal load data: ' + error.message })
      return
    }
    setKolektor(((data || []) as Profile[]).filter((p) => adalahKolektor(p)))
  }

  async function toggleAktif(target: Profile) {
    const aksiBaru = !target.aktif
    const konfirmasi = aksiBaru
      ? `Aktifkan kembali kolektor ${target.nama}?`
      : `Nonaktifkan kolektor ${target.nama}?\n\nAkun ini tidak akan bisa login lagi.`

    if (!confirm(konfirmasi)) return

    setAksiLoading(target.id)
    setPesan(null)

    const update: Record<string, unknown> = { aktif: aksiBaru }
    if (aksiBaru) {
      update.dinonaktifkan_oleh = null
      update.waktu_dinonaktifkan = null
    } else {
      update.dinonaktifkan_oleh = me?.nama || 'Admin'
      update.waktu_dinonaktifkan = new Date().toISOString()
      update.sesi_aktif = false
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', target.id)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal update: ' + error.message })
      setAksiLoading(null)
      return
    }

    setPesan({ tipe: 'ok', teks: `Akun ${target.nama} berhasil di${aksiBaru ? 'aktifkan' : 'nonaktifkan'}.` })
    if (me) await loadKolektor(me.id)
    setAksiLoading(null)
  }

  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    setPesan(null)
    if (!inputNama.trim() || !inputHp.trim() || !inputPass.trim()) {
      setPesan({ tipe: 'err', teks: 'Nama, No HP, dan Password wajib diisi.' })
      return
    }

    setModalLoading(true)
    setModalPesan(null)

    const cekNomor = await validasiNomorHpUnik(inputHp)
    if (!cekNomor.ok) {
      setModalLoading(false)
      setModalPesan(cekNomor.pesan)
      return
    }

    const dasar = {
      id: crypto.randomUUID(),
      email: null,
      nomor_hp: normalisasiNomorHp(inputHp),
      nama: inputNama.trim(),
      lokasi: inputLokasi,
      aktif: true,
      ...(await fieldPasswordBaru(inputPass)),
      operator_id: me.id
    }

    // 1) Coba pakai role khusus 'kolektor' (butuh supabase/role-kolektor.sql).
    let { error } = await supabase
      .from('profiles')
      .insert({ ...dasar, role: 'kolektor', unit: UNIT_KOLEKTOR })

    // 2) Database lama menolak role 'kolektor' (check constraint profiles_role_check).
    //    Simpan sebagai petugas_loket + unit "Kolektor" — aplikasi tetap
    //    mengenalinya sebagai kolektor lewat adalahKolektor().
    if (error && /check constraint|profiles_role_check/i.test(error.message)) {
      const hasil = await supabase
        .from('profiles')
        .insert({ ...dasar, role: 'petugas_loket', unit: UNIT_KOLEKTOR })
      error = hasil.error
    }

    setModalLoading(false)
    if (error) {
      const teks = /check constraint|profiles_role_check/i.test(error.message)
        ? 'Database masih menolak akun baru (check constraint profiles.role). Jalankan SQL di supabase/role-kolektor.sql lalu coba lagi.'
        : pesanGagalSimpanAkun(error)
      setModalPesan(teks)
      return
    }

    setPesan({ tipe: 'ok', teks: `Kolektor ${inputNama.trim()} (${inputLokasi}) berhasil dibuat.` })
    setModalTambah(false)
    setInputNama(''); setInputHp(''); setInputPass(''); setInputLokasi('Tarakan')
    await loadKolektor(me.id)
  }

  function mulaiEdit(p: Profile) {
    setEditId(p.id)
    setEditNama(p.nama)
    setEditHp(p.nomor_hp || '')
    setEditPass('') // password lama tidak bisa ditampilkan (sudah di-hash)
    setEditLokasi((p as any).lokasi || 'Tarakan')
    setPesan(null)
  }

  function batalEdit() {
    setEditId(null)
  }

  async function handleSimpanEdit(id: string) {
    if (!editNama.trim() || !editHp.trim()) {
      setPesan({ tipe: 'err', teks: 'Nama dan No HP wajib diisi.' })
      return
    }

    setEditLoading(true)

    const cekNomor = await validasiNomorHpUnik(editHp, id)
    if (!cekNomor.ok) {
      setEditLoading(false)
      setPesan({ tipe: 'err', teks: cekNomor.pesan })
      return
    }

    const updateData: Record<string, any> = {
      nama: editNama.trim(),
      nomor_hp: normalisasiNomorHp(editHp),
      email: null,
      lokasi: editLokasi
    }

    if (editPass) {
      Object.assign(updateData, await fieldPasswordBaru(editPass))
    }

    const { error } = await supabase.from('profiles').update(updateData).eq('id', id)

    setEditLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: pesanGagalSimpanAkun(error) })
      return
    }

    setPesan({ tipe: 'ok', teks: `Data ${editNama.trim()} berhasil diupdate.` })
    setEditId(null)
    if (me) await loadKolektor(me.id)
  }

  function kirimWA(p: Profile) {
    let noHpMurni = p.nomor_hp ? p.nomor_hp.replace(/\D/g, '') : ''
    if (noHpMurni.startsWith('0')) noHpMurni = '62' + noHpMurni.slice(1)

    const pesan = `Halo ${p.nama}, ini pesan dari Admin. Berikut informasi akun Kolektor Anda:\n\nNo HP: ${p.nomor_hp || noHpMurni}\nRole: Petugas Kolektor\nLokasi: ${(p as any).lokasi || '-'}\n\nPassword TIDAK dikirim lewat chat demi keamanan. Minta Admin mereset password bila lupa.`
    window.open(`https://wa.me/${noHpMurni}?text=${encodeURIComponent(pesan)}`, '_blank')
  }

  if (loading) return <p className="p-6 text-center text-gray-500">Memuat data kolektor…</p>
  if (aksesDitolak) return <p className="p-6 text-center text-red-600 mt-10">Akses ditolak. Halaman ini hanya untuk Admin Utama atau Superadmin aktif.</p>

  const perLokasi = Array.from(
    new Set([
      ...lokasiList,
      ...kolektor.map((p) => String((p as any).lokasi || 'Tarakan').trim()).filter(Boolean),
    ])
  ).map((lok) => ({
    lokasi: lok,
    data: kolektor.filter((p) => String((p as any).lokasi || 'Tarakan').trim() === lok),
  })).filter((grup) => grup.data.length > 0)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Manajemen Petugas Kolektor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Kolektor menagih uang cash dari agen &amp; petugas di lokasi yang sama. Hanya bisa melihat + mencetak laporan penjualan harian.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setModalPesan(null); setModalTambah(true) }} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm font-medium">
              + Tambah Kolektor
            </button>
            <button onClick={() => router.push('/superadmin/pusat-kontrol/admin/petugas')} className="text-sm text-blue-600 hover:underline px-2">
              ← Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${pesan.tipe === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {pesan.teks}
          </div>
        )}

        {perLokasi.length === 0 ? (
          <div className="bg-white p-8 text-center text-gray-500 rounded shadow">Belum ada data kolektor.</div>
        ) : (
          perLokasi.map((grup) => (
            <div key={grup.lokasi} className="mb-8 bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-emerald-600 px-4 py-3 border-b">
                <h2 className="text-white font-bold">📍 Lokasi: {grup.lokasi}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 w-12">No</th>
                    <th className="text-left px-4 py-3">Nama</th>
                    <th className="text-left px-4 py-3">Lokasi Tugas</th>
                    <th className="text-left px-4 py-3">No. HP / Pass</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {grup.data.map((p, idx) => {
                    if (editId === p.id) {
                      return (
                        <tr key={p.id} className="bg-yellow-50 border-t border-yellow-200">
                          <td className="px-4 py-2 text-center font-bold">{idx + 1}</td>
                          <td className="px-4 py-2"><input type="text" value={editNama} onChange={(e) => setEditNama(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" /></td>
                          <td className="px-4 py-2">
                            <select value={editLokasi} onChange={(e) => setEditLokasi(e.target.value)} className="border rounded px-2 py-1 text-gray-900 w-full">
                              {pilihanLokasi(lokasiList, editLokasi).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2 space-y-1">
                            <input type="tel" value={editHp} onChange={(e) => setEditHp(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" />
                            <input type="text" value={editPass} onChange={(e) => setEditPass(e.target.value)} className="border rounded px-2 py-1 w-full text-gray-900" placeholder="Kosongkan jika tidak ganti password" />
                          </td>
                          <td className="px-4 py-2 text-center text-gray-400">—</td>
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
                        <td className="px-4 py-3 font-bold text-emerald-700">{(p as any).lokasi || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>{p.nomor_hp || '-'}</div>
                          <div className="text-xs text-gray-400">{p.password_hash || p.password_plain ? '••••••••' : '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.aktif ? (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktif</span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Nonaktif</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                          <button onClick={() => kirimWA(p)} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs hover:bg-green-200 font-medium" title="Kirim WA">WA</button>
                          <button onClick={() => mulaiEdit(p)} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200">Edit</button>
                          <button onClick={() => toggleAktif(p)} disabled={aksiLoading === p.id} className={`px-2 py-1 rounded text-xs ${p.aktif ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                            {aksiLoading === p.id ? '...' : p.aktif ? 'Nonaktifkan' : 'Aktifkan'}
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


      {modalTambah && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Tambah Kolektor</h3>
            {modalPesan && (
              <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {modalPesan}
              </div>
            )}
            <form onSubmit={handleTambah}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <input type="text" value={inputNama} onChange={(e) => setInputNama(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor HP (untuk login)</label>
              <input type="tel" value={inputHp} onChange={(e) => setInputHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" placeholder="0823..." required />

              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Tugas</label>
              <select value={inputLokasi} onChange={(e) => setInputLokasi(e.target.value)} className="w-full border rounded px-3 py-2 mb-3 text-gray-900" required>
                {pilihanLokasi(lokasiList, inputLokasi).map((lok) => <option key={lok} value={lok}>{lok}</option>)}
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

