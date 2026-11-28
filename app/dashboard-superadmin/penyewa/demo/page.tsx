'use client'

// app/dashboard-superadmin/penyewa/demo/page.tsx
// Superadmin REAL melihat daftar penyewa yang benar-benar ada di database DEMO
// dan membuat akun pemilik kapal demo dari halaman ini. Demo tidak punya
// Superadmin dan tidak punya halaman ini. Tidak ada data contoh: kalau database
// demo masih bersih, daftar ini kosong.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PenyewaDemo = {
  id: string
  nama: string
  email: string
  nomor_hp: string | null
  nama_perusahaan: string | null
  aktif: boolean
  created_at: string
}

export default function DaftarPenyewaDemoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [penyewaList, setPenyewaList] = useState<PenyewaDemo[]>([])
  const [demoUrl, setDemoUrl] = useState('')
  const [token, setToken] = useState('')

  // Form tambah penyewa demo (dibuat dari Superadmin REAL, ditulis ke database demo).
  const [formTerbuka, setFormTerbuka] = useState(false)
  const [simpan, setSimpan] = useState(false)
  const [judulSukses, setJudulSukses] = useState('Penyewa demo dibuat')
  const [pesanSukses, setPesanSukses] = useState('')
  const [pesanGagal, setPesanGagal] = useState('')
  const [form, setForm] = useState({
    nama: '',
    nama_perusahaan: '',
    email: '',
    nomor_hp: '',
    password: ''
  })

  // Edit penyewa demo (nama, perusahaan, HP, email login, password, status).
  const [editTarget, setEditTarget] = useState<PenyewaDemo | null>(null)
  const [editForm, setEditForm] = useState({
    nama: '',
    nama_perusahaan: '',
    email: '',
    nomor_hp: '',
    password: '',
    aktif: true
  })
  const [editSimpan, setEditSimpan] = useState(false)
  const [editGagal, setEditGagal] = useState('')

  // Hapus permanen penyewa demo (wajib mengetik nama perusahaan / nama pemilik).
  const [hapusTarget, setHapusTarget] = useState<PenyewaDemo | null>(null)
  const [hapusKetik, setHapusKetik] = useState('')
  const [hapusLoading, setHapusLoading] = useState(false)
  const [hapusGagal, setHapusGagal] = useState('')

  async function muatPenyewa(tokenSesi: string) {
    const response = await fetch('/api/superadmin/demo/penyewa', {
      headers: { Authorization: `Bearer ${tokenSesi}` },
      cache: 'no-store'
    })
    const hasil = await response.json()
    if (!response.ok) throw new Error(hasil.error || 'Gagal memuat penyewa demo.')
    setPenyewaList((hasil.penyewa || []) as PenyewaDemo[])
    setDemoUrl(String(hasil.demoUrl || process.env.NEXT_PUBLIC_DEMO_URL || '').trim())
  }

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/superadmin')
        return
      }

      const { data: profil } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profil || (profil.role || '').trim().toLowerCase() !== 'superadmin') {
        router.push('/superadmin')
        return
      }

      try {
        setToken(session.access_token)
        await muatPenyewa(session.access_token)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Gagal memuat penyewa demo.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  async function handleTambah(e: React.FormEvent) {
    e.preventDefault()
    if (simpan) return

    setSimpan(true)
    setPesanSukses('')
    setPesanGagal('')

    try {
      const response = await fetch('/api/superadmin/demo/tambah-penyewa', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(form)
      })
      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal membuat penyewa demo.')

      setJudulSukses('Penyewa demo dibuat')
      setPesanSukses(
        `Akun ${form.email} dibuat. Minta pemilik login di ${demoUrl || 'URL demo'}/login dengan email dan password yang tadi diisi.`
      )
      setForm({ nama: '', nama_perusahaan: '', email: '', nomor_hp: '', password: '' })
      setFormTerbuka(false)
      await muatPenyewa(token)
    } catch (err: unknown) {
      setPesanGagal(err instanceof Error ? err.message : 'Gagal membuat penyewa demo.')
    } finally {
      setSimpan(false)
    }
  }

  function bukaEdit(p: PenyewaDemo) {
    setPesanSukses('')
    setPesanGagal('')
    setEditGagal('')
    setEditTarget(p)
    setEditForm({
      nama: p.nama || '',
      nama_perusahaan: p.nama_perusahaan || '',
      email: p.email || '',
      nomor_hp: p.nomor_hp || '',
      password: '',
      aktif: Boolean(p.aktif)
    })
  }

  async function handleSimpanEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget || editSimpan) return

    setEditSimpan(true)
    setEditGagal('')

    try {
      const response = await fetch(`/api/superadmin/demo/penyewa/${editTarget.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(editForm)
      })
      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal menyimpan perubahan.')

      const namaTampil = (editForm.nama_perusahaan || editForm.nama || '').trim()
      const catatanPassword = hasil.passwordDiubah
        ? ` Password baru untuk ${editForm.email} sudah aktif.`
        : ' Password tidak diubah.'
      const catatanStatus = editForm.aktif
        ? ''
        : ' Akun dinonaktifkan: pemilik tidak bisa login sampai diaktifkan lagi.'

      setJudulSukses('Penyewa demo diperbarui')
      setPesanSukses(`Data ${namaTampil} tersimpan.${catatanPassword}${catatanStatus}`)
      setEditTarget(null)
      await muatPenyewa(token)
    } catch (err: unknown) {
      setEditGagal(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.')
    } finally {
      setEditSimpan(false)
    }
  }

  function bukaHapus(p: PenyewaDemo) {
    setPesanSukses('')
    setPesanGagal('')
    setHapusGagal('')
    setHapusKetik('')
    setHapusTarget(p)
  }

  async function handleHapus(e: React.FormEvent) {
    e.preventDefault()
    if (!hapusTarget || hapusLoading) return

    const namaTampil = (hapusTarget.nama_perusahaan || hapusTarget.nama || '').trim()
    if (hapusKetik.trim().toLowerCase() !== namaTampil.toLowerCase()) return

    setHapusLoading(true)
    setHapusGagal('')

    try {
      const response = await fetch(`/api/superadmin/demo/penyewa/${hapusTarget.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ konfirmasi: hapusKetik })
      })
      const hasil = await response.json()
      if (!response.ok) throw new Error(hasil.error || 'Gagal menghapus penyewa demo.')

      setJudulSukses('Penyewa demo dihapus')
      setPesanSukses(hasil.message || `${namaTampil} dihapus dari database demo.`)
      setHapusTarget(null)
      setHapusKetik('')
      await muatPenyewa(token)
    } catch (err: unknown) {
      setHapusGagal(err instanceof Error ? err.message : 'Gagal menghapus penyewa demo.')
    } finally {
      setHapusLoading(false)
    }
  }

  if (loading) {
    return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat penyewa demo...</p>
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-6xl mx-auto">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Daftar Penyewa Demo</h1>
            <p className="text-sm text-gray-400">Dibaca langsung dari database demo. Tidak ada data real di halaman ini.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setPesanSukses('')
                setPesanGagal('')
                setFormTerbuka((buka) => !buka)
              }}
              className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold"
            >
              + Tambah Penyewa Demo
            </button>
            <button
              onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/demo')}
              className="bg-amber-900 hover:bg-amber-800 text-white px-4 py-2 rounded text-sm font-bold border border-amber-700"
            >
              Fee Demo
            </button>
            <button
              onClick={() => router.push('/dashboard-superadmin/penyewa')}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        <div className="bg-amber-950/60 border border-amber-800 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-200">Environment demo terpisah</p>
          <p className="text-xs text-amber-100/80 mt-1">
            Akun pemilik kapal demo dibuat, diubah, dan dihapus dari halaman ini, lalu ditulis ke
            database demo lewat server (service key demo tidak pernah dikirim ke browser).
            Setelah dibuat, pemilik login sendiri di /login pada deployment demo.
          </p>
        </div>

        {pesanSukses && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-4 mb-4">
            <p className="text-sm font-bold text-green-200">{judulSukses}</p>
            <p className="text-xs text-green-100 mt-1 break-words">{pesanSukses}</p>
          </div>
        )}

        {formTerbuka && (
          <form onSubmit={handleTambah} className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
            <p className="text-sm font-bold text-white">Tambah Penyewa Demo</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Pemilik memakai email + password di bawah untuk login di {demoUrl || 'deployment demo'}/login.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-gray-300">Nama Pemilik *</span>
                <input
                  type="text"
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  required
                  placeholder="Contoh: Budi Santoso"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-300">Nama Perusahaan</span>
                <input
                  type="text"
                  value={form.nama_perusahaan}
                  onChange={(e) => setForm({ ...form, nama_perusahaan: e.target.value })}
                  placeholder="Contoh: PT Samudra Jaya"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-300">Email Login *</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="pemilik@contoh.com"
                  autoComplete="off"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-300">Nomor HP / WA</span>
                <input
                  type="tel"
                  value={form.nomor_hp}
                  onChange={(e) => setForm({ ...form, nomor_hp: e.target.value })}
                  placeholder="08xxxxxxxxxx"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-gray-300">Password Demo *</span>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-600 focus:outline-none"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Catat dan berikan password ini ke pemilik kapal. Tidak dikirim lewat email.
                </span>
              </label>
            </div>

            {pesanGagal && (
              <p className="mt-3 text-xs text-red-300 bg-red-950 border border-red-800 rounded p-2 whitespace-pre-wrap">
                {pesanGagal}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={simpan}
                className="bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold"
              >
                {simpan ? 'Menyimpan...' : 'Simpan Penyewa Demo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormTerbuka(false)
                  setPesanGagal('')
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {error ? (
          <div className="bg-red-950 border border-red-800 rounded-xl p-5">
            <p className="text-sm font-bold text-red-200">Demo belum bisa dibaca</p>
            <p className="text-xs text-red-100 mt-2 whitespace-pre-wrap">{error}</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-4">Nama Pemilik / PT</th>
                    <th className="px-6 py-4">Kontak</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Terdaftar</th>
                    <th className="px-6 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {penyewaList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                        Belum ada penyewa demo. Database demo masih bersih.
                      </td>
                    </tr>
                  ) : (
                    penyewaList.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-750 transition">
                        <td className="px-6 py-4">
                          <p className="font-bold text-white">{p.nama}</p>
                          <p className="text-xs text-gray-400">{p.nama_perusahaan || '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p>{p.email}</p>
                          <p className="text-xs text-green-400">{p.nomor_hp || 'Belum ada WA'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${p.aktif ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                            {p.aktif ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                            <button
                              onClick={() => bukaEdit(p)}
                              className="text-blue-400 hover:text-blue-300 text-xs font-bold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => bukaHapus(p)}
                              className="text-red-500 hover:text-red-400 text-xs font-bold"
                            >
                              Hapus
                            </button>
                            {demoUrl ? (
                              <a
                                href={demoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-400 hover:text-amber-300 text-xs font-bold"
                              >
                                Buka Demo
                              </a>
                            ) : (
                              <span className="text-xs text-gray-500">URL demo belum diset</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <h3 className="text-lg font-bold text-white">Edit Penyewa Demo</h3>
              <button
                onClick={() => setEditTarget(null)}
                className="text-xl leading-none text-gray-400 hover:text-white"
                aria-label="Tutup"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSimpanEdit} className="space-y-4 p-4">
              <p className="text-xs text-gray-400">
                Perubahan langsung ditulis ke database demo. Kalau email atau password diganti, login
                pemilik di deployment demo ikut berubah.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Nama Pemilik *</span>
                  <input
                    type="text"
                    required
                    value={editForm.nama}
                    onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Nama Perusahaan</span>
                  <input
                    type="text"
                    value={editForm.nama_perusahaan}
                    onChange={(e) => setEditForm({ ...editForm, nama_perusahaan: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Email Login *</span>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Nomor HP / WA</span>
                  <input
                    type="tel"
                    value={editForm.nomor_hp}
                    onChange={(e) => setEditForm({ ...editForm, nomor_hp: e.target.value })}
                    placeholder="08xxxxxxxxxx"
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Password Baru (opsional)</span>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Kosongkan bila tidak diganti"
                    autoComplete="new-password"
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="mt-1 block text-xs text-gray-500">Minimal 6 karakter.</span>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-300">Status Akun</span>
                  <select
                    value={editForm.aktif ? 'aktif' : 'nonaktif'}
                    onChange={(e) => setEditForm({ ...editForm, aktif: e.target.value === 'aktif' })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="aktif">Aktif (bisa login)</option>
                    <option value="nonaktif">Nonaktif (tidak bisa login)</option>
                  </select>
                </label>
              </div>

              {editGagal && (
                <p className="whitespace-pre-wrap rounded border border-red-800 bg-red-950 p-2 text-xs text-red-300">
                  {editGagal}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="rounded px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editSimpan}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-gray-600"
                >
                  {editSimpan ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {hapusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-red-700 bg-gray-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <h3 className="text-lg font-bold text-red-400">Hapus Penyewa Demo</h3>
              <button
                onClick={() => setHapusTarget(null)}
                className="text-xl leading-none text-gray-400 hover:text-white"
                aria-label="Tutup"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleHapus} className="space-y-4 p-4">
              <p className="text-sm text-gray-300">
                <span className="font-bold text-white">
                  {hapusTarget.nama_perusahaan || hapusTarget.nama}
                </span>{' '}
                ({hapusTarget.email})
              </p>

              <ul className="space-y-1 rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
                <li>&bull; Akun login demo pemilik ini dihapus permanen.</li>
                <li>&bull; Kapal, jadwal, kursi, tiket, pembayaran, dan refund miliknya di database demo ikut dihapus.</li>
                <li>&bull; Staf/petugas demo di bawahnya ikut dihapus.</li>
                <li>&bull; Database demo tidak menyimpan catatan penghapusan.</li>
                <li className="font-bold">Tindakan ini TIDAK bisa dibatalkan.</li>
              </ul>

              <label className="block">
                <span className="text-xs font-bold text-gray-400">
                  Ketik{' '}
                  <span className="text-white">
                    {hapusTarget.nama_perusahaan || hapusTarget.nama}
                  </span>{' '}
                  untuk konfirmasi
                </span>
                <input
                  type="text"
                  value={hapusKetik}
                  onChange={(e) => setHapusKetik(e.target.value)}
                  autoFocus
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                />
              </label>

              {hapusGagal && (
                <p className="whitespace-pre-wrap rounded border border-red-800 bg-red-950 p-2 text-xs text-red-300">
                  {hapusGagal}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHapusTarget(null)}
                  className="rounded px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    hapusLoading ||
                    hapusKetik.trim().toLowerCase() !==
                      (hapusTarget.nama_perusahaan || hapusTarget.nama || '').trim().toLowerCase()
                  }
                  className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                  {hapusLoading ? 'Menghapus...' : 'Hapus Permanen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
