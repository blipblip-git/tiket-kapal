'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, type Profile } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'

type AdminKapal = {
  id: string
  email: string
  nama: string
  nama_akun: string | null
  nama_perusahaan: string | null
  nomor_hp: string | null
  aktif: boolean
}

export default function ManajemenTenantPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tenants, setTenants] = useState<AdminKapal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  
  // State untuk form tambah tenant
  const [showForm, setShowForm] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formNamaPerusahaan, setFormNamaPerusahaan] = useState('')
  const [formNamaAkun, setFormNamaAkun] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formNoWa, setFormNoWa] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // State untuk edit
  const [editTenant, setEditTenant] = useState<AdminKapal | null>(null)
  const [editNamaPerusahaan, setEditNamaPerusahaan] = useState('')
  const [editNamaAkun, setEditNamaAkun] = useState('')
  const [editNoWa, setEditNoWa] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [resetLoading, setResetLoading] = useState<string | null>(null)
  const [passwordBaru, setPasswordBaru] = useState<{ [key: string]: string }>({})

  // Saklar tenant (nonaktifkan/aktifkan) & hapus permanen
  const [statusLoading, setStatusLoading] = useState<string | null>(null)
  const [hapusTarget, setHapusTarget] = useState<AdminKapal | null>(null)
  const [hapusKetik, setHapusKetik] = useState('')
  const [hapusLoading, setHapusLoading] = useState(false)

  useEffect(() => {
    async function init() {
      const p = await getProfile({ utamakanAuth: true })
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(p)
      await fetchTenants()
      setLoading(false)
    }
    init()
  }, [router])

  async function fetchTenants() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, nama, nama_akun, nama_perusahaan, nomor_hp, aktif')
      .eq('role', 'admin_utama')
      .neq('email', 'superadmin@gmail.com')
      .order('nama', { ascending: true })

    if (error) {
      setError('Gagal memuat data tenant: ' + error.message)
      return
    }
    setTenants(data || [])
  }

  async function handleTambahTenant(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    setPesan('')

    if (!formEmail || !formNamaPerusahaan || !formNamaAkun || !formPassword || !formNoWa) {
      setPesan('Semua kolom wajib diisi.')
      setFormLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formEmail,
      password: formPassword,
    })

    if (authError) {
      setPesan('Gagal daftar: ' + authError.message)
      setFormLoading(false)
      return
    }

    if (!authData.user) {
      setPesan('Gagal mendapatkan data user.')
      setFormLoading(false)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: formEmail,
        nama: formNamaAkun,
        nama_akun: formNamaAkun,
        nama_perusahaan: formNamaPerusahaan,
        role: 'admin_utama',
        ...(await fieldPasswordBaru(formPassword)),
        nomor_hp: formNoWa,
        aktif: true,
      })

    if (profileError) {
      setPesan('Gagal buat profil: ' + profileError.message)
      setFormLoading(false)
      return
    }

    setPesan(`Berhasil membuat akun untuk ${formNamaPerusahaan}. Silakan kirim email & password ke WA ${formNoWa}.`)
    setFormLoading(false)
    setShowForm(false)
    setFormEmail('')
    setFormNamaPerusahaan('')
    setFormNamaAkun('')
    setFormPassword('')
    setFormNoWa('')
    await fetchTenants()
  }

  async function handleEditTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!editTenant) return
    setEditLoading(true)
    setPesan('')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        nama_perusahaan: editNamaPerusahaan,
        nama_akun: editNamaAkun,
        nama: editNamaAkun,
        nomor_hp: editNoWa,
      })
      .eq('id', editTenant.id)

    if (updateError) {
      setPesan('Gagal update: ' + updateError.message)
      setEditLoading(false)
      return
    }

    setPesan(`Data untuk ${editNamaPerusahaan} berhasil diperbarui.`)
    setEditLoading(false)
    setEditTenant(null)
    await fetchTenants()
  }

  function bukaEdit(t: AdminKapal) {
    setEditTenant(t)
    setEditNamaPerusahaan(t.nama_perusahaan || '')
    setEditNamaAkun(t.nama_akun || t.nama || '')
    setEditNoWa(t.nomor_hp || '')
  }

  async function handleResetPassword(target: AdminKapal) {
    if (!confirm(`Yakin ingin mereset password untuk ${target.nama} (${target.email})?`)) return

    setResetLoading(target.id)
    setPesan('')

    const newPass = 'Reset' + Math.floor(1000 + Math.random() * 9000) + '!'

    const { error: updateError } = await supabase
      .from('profiles')
      .update(await fieldPasswordBaru(newPass))
      .eq('id', target.id)

    if (updateError) {
      setPesan('Gagal reset password: ' + updateError.message)
      setResetLoading(null)
      return
    }

    setPasswordBaru((prev) => ({ ...prev, [target.id]: newPass }))
    setPesan(`Password untuk ${target.nama} berhasil direset. Silakan kirim password baru ke WhatsApp ${target.nomor_hp || '(tidak ada)'}.`)
    setResetLoading(null)
  }

  async function headerSuperadmin() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Sesi Superadmin tidak ditemukan. Login ulang di /superadmin.')
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  // SAKLAR: nonaktifkan / aktifkan penyewa + seluruh stafnya (data tetap utuh).
  async function handleUbahStatus(target: AdminKapal) {
    const akanAktifkan = !target.aktif
    const nama = target.nama_perusahaan || target.nama
    const konfirmasi = confirm(akanAktifkan
      ? `Aktifkan kembali akun "${nama}" (${target.email})?\n\nPenyewa dan seluruh stafnya bisa login lagi.`
      : `Nonaktifkan akun "${nama}" (${target.email})?\n\nPenyewa dan SEMUA staf/agennya tidak bisa login. Semua data (kapal, jadwal, tiket, laporan) tetap tersimpan dan bisa diaktifkan kembali.`)

    if (!konfirmasi) return

    setStatusLoading(target.id)
    setPesan('')

    try {
      const response = await fetch('/api/superadmin/status-penyewa', {
        method: 'POST',
        headers: await headerSuperadmin(),
        body: JSON.stringify({ id: target.id, aktif: akanAktifkan }),
      })
      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal mengubah status')
      setPesan(hasil.message || 'Status penyewa berubah.')
      await fetchTenants()
    } catch (err: any) {
      setPesan('Gagal mengubah status: ' + err.message)
    } finally {
      setStatusLoading(null)
    }
  }

  // HAPUS PERMANEN: semua data + staf + auth user dihapus bersih.
  function bukaHapus(target: AdminKapal) {
    setHapusTarget(target)
    setHapusKetik('')
    setPesan('')
  }

  async function handleHapusPermanen(e: React.FormEvent) {
    e.preventDefault()
    if (!hapusTarget) return

    setHapusLoading(true)
    setPesan('')

    try {
      const response = await fetch('/api/superadmin/hapus-penyewa', {
        method: 'POST',
        headers: await headerSuperadmin(),
        body: JSON.stringify({ id: hapusTarget.id, konfirmasi: hapusKetik }),
      })
      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal menghapus penyewa')

      setPesan(hasil.message || 'Penyewa dihapus permanen.')
      setHapusTarget(null)
      setHapusKetik('')
      await fetchTenants()
    } catch (err: any) {
      setPesan('Gagal menghapus: ' + err.message)
    } finally {
      setHapusLoading(false)
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-8 bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <div>
            <h1 className="text-2xl font-bold tracking-wider">MANAJEMEN PEMILIK KAPAL</h1>
            <p className="text-sm text-gray-400 mt-1">Daftar Akun Admin Utama (Tenant)</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-500 font-bold text-sm"
            >
              + Tambah Pemilik Kapal
            </button>
            <button onClick={() => router.push('/dashboard-superadmin')} className="text-sm text-gray-300 hover:text-white hover:underline px-2">
              &larr; Kembali
            </button>
          </div>
        </div>

        {pesan && (
          <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded mb-4 text-sm">
            {pesan}
          </div>
        )}

        {/* FORM TAMBAH TENANT */}
        {showForm && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 mb-6">
            <h2 className="text-lg font-bold mb-4 text-white">Form Tambah Pemilik Kapal Baru</h2>
            <form onSubmit={handleTambahTenant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Nama Perusahaan</label>
                <input type="text" value={formNamaPerusahaan} onChange={(e) => setFormNamaPerusahaan(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Email</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Nama Akun (Username)</label>
                <input type="text" value={formNamaAkun} onChange={(e) => setFormNamaAkun(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Password</label>
                <input type="text" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required placeholder="Minimal 6 karakter" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">No WhatsApp</label>
                <input type="tel" value={formNoWa} onChange={(e) => setFormNoWa(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={formLoading} className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 font-bold disabled:bg-gray-600">
                  {formLoading ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MODAL EDIT TENANT */}
        {editTenant && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 w-full max-w-md">
              <h2 className="text-lg font-bold mb-4 text-white">Edit Data: {editTenant.email}</h2>
              <form onSubmit={handleEditTenant} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Nama Perusahaan</label>
                  <input type="text" value={editNamaPerusahaan} onChange={(e) => setEditNamaPerusahaan(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Nama Akun (Username)</label>
                  <input type="text" value={editNamaAkun} onChange={(e) => setEditNamaAkun(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">No WhatsApp</label>
                  <input type="tel" value={editNoWa} onChange={(e) => setEditNoWa(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setEditTenant(null)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded">Batal</button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-600">
                    {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL HAPUS PERMANEN */}
        {hapusTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-red-700 w-full max-w-md">
              <h2 className="text-lg font-bold mb-1 text-red-400">Hapus Permanen Penyewa</h2>
              <p className="text-sm text-gray-300 mb-4">
                <span className="font-bold text-white">{hapusTarget.nama_perusahaan || hapusTarget.nama}</span> ({hapusTarget.email})
              </p>

              <ul className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-3 mb-4 space-y-1">
                <li>• Semua kapal, jadwal, kursi, tiket, pembayaran, refund dihapus.</li>
                <li>• Semua staf &amp; agen penyewa ini dihapus (tidak bisa login lagi).</li>
                <li>• Akun Admin Utama penyewa ini dihapus permanen.</li>
                <li>• Hanya catatan: nama pemilik, nama perusahaan, email, no HP.</li>
                <li className="font-bold">Tindakan ini TIDAK bisa dibatalkan.</li>
              </ul>

              <form onSubmit={handleHapusPermanen} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Ketik <span className="font-bold text-white">{hapusTarget.nama_perusahaan || hapusTarget.nama}</span> untuk konfirmasi
                  </label>
                  <input
                    type="text"
                    value={hapusKetik}
                    onChange={(e) => setHapusKetik(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder={hapusTarget.nama_perusahaan || hapusTarget.nama}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setHapusTarget(null)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded">
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={hapusLoading || hapusKetik.trim().toLowerCase() !== (hapusTarget.nama_perusahaan || hapusTarget.nama).trim().toLowerCase()}
                    className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 font-bold disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    {hapusLoading ? 'Menghapus...' : 'Hapus Permanen'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="text-left px-4 py-3">Perusahaan / Akun</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">No WA</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">Belum ada Admin Kapal yang terdaftar.</td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{t.nama_perusahaan || 'Belum diisi'}</p>
                      <p className="text-xs text-gray-400">{t.nama_akun || t.nama}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.email}</td>
                    <td className="px-4 py-3 text-gray-300">{t.nomor_hp || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${t.aktif ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {t.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => bukaEdit(t)}
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-500 font-bold"
                        >
                          ✏️ Edit
                        </button>
                        {passwordBaru[t.id] ? (
                          <div className="text-xs">
                            <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono">{passwordBaru[t.id]}</code>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleResetPassword(t)}
                            disabled={resetLoading === t.id}
                            className="bg-yellow-600 text-white px-2 py-1 rounded text-xs hover:bg-yellow-700 font-bold disabled:bg-gray-600"
                          >
                            {resetLoading === t.id ? '...' : '🔑 Reset'}
                          </button>
                        )}
                        <button
                          onClick={() => handleUbahStatus(t)}
                          disabled={statusLoading === t.id}
                          className={`${t.aktif ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white px-2 py-1 rounded text-xs font-bold disabled:bg-gray-600`}
                        >
                          {statusLoading === t.id ? '...' : t.aktif ? '⏸ Nonaktifkan' : '▶ Aktifkan'}
                        </button>
                        <button
                          onClick={() => bukaHapus(t)}
                          className="bg-red-700 text-white px-2 py-1 rounded text-xs hover:bg-red-600 font-bold"
                        >
                          🗑 Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}