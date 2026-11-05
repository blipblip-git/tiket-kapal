'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, logout, type Profile } from '@/lib/supabase'

type Kapal = {
  id: string
  nama: string
  kapasitas: number
  status: string
}

type Template = {
  id: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  aktif: boolean
}

const DAFTAR_RUTE = ['Tarakan', 'Tanjung Selor', 'Malinau', 'Nunukan', 'Bunyu']
const JAM_OPTIONS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const MENIT_OPTIONS = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

export default function TemplateJadwalPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [templateList, setTemplateList] = useState<Template[]>([])
  const [sedangSimpan, setSedangSimpan] = useState(false)
  const [pesanSukses, setPesanSukses] = useState('')

  // State untuk Edit
  const [editId, setEditId] = useState<string | null>(null)

  const [form, setForm] = useState({
    kapal_id: '',
    rute_asal: '',
    rute_tujuan: '',
    jam: '07',
    menit: '00',
  })

  useEffect(() => {
    async function loadData() {
      const p = await getProfile()
      if (!p) {
        router.push('/login')
        return
      }

      if (p.role !== 'admin_utama') {
        setError('Hanya admin utama yang bisa akses halaman ini')
        setLoading(false)
        return
      }

      setProfile(p)

      // Ambil kapal yang statusnya aktif saja
      const { data: kapalData } = await supabase
        .from('kapal')
        .select('id, nama, kapasitas, status')
        .eq('status', 'aktif')
        .order('nama')

      setKapalList(kapalData || [])

      // Ambil list template
      const { data: templateData } = await supabase
        .from('template_jadwal')
        .select('*')
        .order('jam_berangkat', { ascending: true })

      setTemplateList(templateData || [])
      setLoading(false)
    }

    loadData()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPesanSukses('')
    setSedangSimpan(true)

    if (!form.kapal_id || !form.rute_asal || !form.rute_tujuan) {
      setError('Semua field wajib diisi')
      setSedangSimpan(false)
      return
    }

    if (form.rute_asal === form.rute_tujuan) {
      setError('Rute asal dan tujuan tidak boleh sama')
      setSedangSimpan(false)
      return
    }

    // Gabung jam dan menit ke format HH:MM
    const jamBerangkat = `${form.jam}:${form.menit}`

    const payload = {
      kapal_id: form.kapal_id,
      rute_asal: form.rute_asal,
      rute_tujuan: form.rute_tujuan,
      jam_berangkat: jamBerangkat,
      aktif: true,
    }

    if (editId) {
      // UPDATE
      const { error: errUpdate } = await supabase
        .from('template_jadwal')
        .update(payload)
        .eq('id', editId)

      if (errUpdate) {
        setError('Gagal update: ' + errUpdate.message)
        setSedangSimpan(false)
        return
      }
      setPesanSukses('Jadwal berhasil diupdate!')
      setEditId(null)
    } else {
      // INSERT
      const { error: errInsert } = await supabase
        .from('template_jadwal')
        .insert(payload)

      if (errInsert) {
        setError('Gagal simpan: ' + errInsert.message)
        setSedangSimpan(false)
        return
      }
      setPesanSukses('Jadwal berhasil disimpan!')
    }

    // Refresh list
    const { data: templateData } = await supabase
      .from('template_jadwal')
      .select('*')
      .order('jam_berangkat', { ascending: true })

    setTemplateList(templateData || [])
    setSedangSimpan(false)

    // Reset form
    setForm({
      ...form,
      kapal_id: '',
      rute_asal: '',
      rute_tujuan: '',
    })
  }

  async function handleHapus(id: string) {
    if (!confirm('Yakin mau hapus jadwal ini?')) return

    const { error: errDelete } = await supabase
      .from('template_jadwal')
      .delete()
      .eq('id', id)

    if (errDelete) {
      setError('Gagal hapus: ' + errDelete.message)
      return
    }

    setTemplateList(templateList.filter((t) => t.id !== id))
  }

  function handleEdit(t: Template) {
    setEditId(t.id)
    const [jam, menit] = t.jam_berangkat.split(':')
    setForm({
      kapal_id: t.kapal_id,
      rute_asal: t.rute_asal,
      rute_tujuan: t.rute_tujuan,
      jam: jam || '07',
      menit: menit ? menit.slice(0, 2) : '00',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function batalEdit() {
    setEditId(null)
    setForm({
      kapal_id: '',
      rute_asal: '',
      rute_tujuan: '',
      jam: '07',
      menit: '00',
    })
  }

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat...</p>
  if (error && !profile) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Template Jadwal</h1>
            <p className="text-sm text-gray-700">Atur jadwal keberangkatan manual per kapal</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
          >
            Logout
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-300 p-3 rounded mb-4">
          <p className="text-blue-800 text-xs">
            💡 Input jadwal per jam berangkat. Jadwal ini berlaku otomatis setiap hari sampai diubah.
          </p>
        </div>

        {/* Form Input */}
        <div className="bg-white p-6 rounded shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">
              {editId ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}
            </h2>
            {editId && (
              <button onClick={batalEdit} className="text-sm text-red-600 hover:underline">
                Batal Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Kapal</label>
                <select
                  value={form.kapal_id}
                  onChange={(e) => setForm({ ...form, kapal_id: e.target.value })}
                  className={`w-full border rounded px-3 py-2 ${
                    form.kapal_id ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  required
                >
                  <option value="">-- Pilih kapal --</option>
                  {kapalList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama} ({k.kapasitas} kursi)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Jam Berangkat (24 Jam)</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={form.jam}
                    onChange={(e) => setForm({ ...form, jam: e.target.value })}
                    className="border rounded px-3 py-2 text-gray-900 w-full"
                    required
                  >
                    {JAM_OPTIONS.map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                  <span className="font-bold text-gray-700">:</span>
                  <select
                    value={form.menit}
                    onChange={(e) => setForm({ ...form, menit: e.target.value })}
                    className="border rounded px-3 py-2 text-gray-900 w-full"
                    required
                  >
                    {MENIT_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Rute Asal</label>
                <select
                  value={form.rute_asal}
                  onChange={(e) => setForm({ ...form, rute_asal: e.target.value })}
                  className={`w-full border rounded px-3 py-2 ${
                    form.rute_asal ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  required
                >
                  <option value="">-- Pilih Rute Asal --</option>
                  {DAFTAR_RUTE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Rute Tujuan</label>
                <select
                  value={form.rute_tujuan}
                  onChange={(e) => setForm({ ...form, rute_tujuan: e.target.value })}
                  className={`w-full border rounded px-3 py-2 ${
                    form.rute_tujuan ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  required
                >
                  <option value="">-- Pilih Rute Tujuan --</option>
                  {DAFTAR_RUTE.map((r) => (
                    <option key={r} value={r} disabled={r === form.rute_asal}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {pesanSukses && <p className="text-green-600 text-sm">{pesanSukses}</p>}

            <button
              type="submit"
              disabled={sedangSimpan}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {sedangSimpan ? 'Menyimpan...' : editId ? 'Update Jadwal' : 'Simpan Jadwal'}
            </button>
          </form>
        </div>

        {/* List Template */}
        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold text-gray-900 mb-4">Daftar Jadwal Keberangkatan</h2>

          {templateList.length === 0 ? (
            <p className="text-gray-700 text-sm">Belum ada jadwal.</p>
          ) : (
            <div className="space-y-3">
              {templateList.map((t) => {
                const kapal = kapalList.find((k) => k.id === t.kapal_id)
                return (
                  <div key={t.id} className="border rounded p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-900">
                          {t.rute_asal} → {t.rute_tujuan}
                        </p>
                        <p className="text-sm text-gray-700">{kapal?.nama || '(Kapal tidak aktif/dihapus)'}</p>
                        <p className="text-lg text-blue-600 font-bold mt-1">
                          Jam {t.jam_berangkat.slice(0, 5)}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleEdit(t)}
                          className="text-blue-600 text-sm hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleHapus(t.id)}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <a href="/dashboard" className="text-blue-600 text-sm hover:underline">
            ← Kembali ke Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}