'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Kapal = {
  id: string
  nama: string
  kapasitas: number
  status: string
}

type MasterRute = {
  id: string
  rute_asal: string
  rute_tujuan: string
  harga: number
}

type Template = {
  id: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  aktif: boolean
  kapasitas: number
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
  const [masterRuteList, setMasterRuteList] = useState<MasterRute[]>([])
  const [templateList, setTemplateList] = useState<Template[]>([])
  const [sedangSimpan, setSedangSimpan] = useState(false)
  const [pesanSukses, setPesanSukses] = useState('')

  const [editId, setEditId] = useState<string | null>(null)
  const [editHargaId, setEditHargaId] = useState<string | null>(null)
  const [editHargaValue, setEditHargaValue] = useState('')

  const [form, setForm] = useState({
    kapal_id: '',
    rute_asal: '',
    rute_tujuan: '',
    jam: '07',
    menit: '00',
    kapasitas: '0', // <-- Kolom Jumlah Kursi
  })

  useEffect(() => {
    async function loadData() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
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

      const { data: kapalData } = await supabase
        .from('kapal')
        .select('id, nama, kapasitas, status')
        .eq('status', 'aktif')
        .eq('operator_id', p.id)
        .order('nama')
      setKapalList(kapalData || [])

      const { data: ruteData } = await supabase
        .from('master_rute')
        .select('*')
        .eq('operator_id', p.id)
      setMasterRuteList(ruteData || [])

      const { data: templateData } = await supabase
        .from('template_jadwal')
        .select('*')
        .eq('operator_id', p.id)
        .order('jam_berangkat', { ascending: true })
      setTemplateList(templateData || [])

      setLoading(false)
    }
    loadData()
  }, [router])

  async function handleTambahRute(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    const asal = (e.target as any).asal.value
    const tujuan = (e.target as any).tujuan.value
    const harga = parseInt((e.target as any).harga.value)

    if (asal === tujuan) {
      alert('Rute asal dan tujuan tidak boleh sama!')
      return
    }

    const { error: err } = await supabase.from('master_rute').insert({
      operator_id: profile.id,
      rute_asal: asal,
      rute_tujuan: tujuan,
      harga: harga,
    })

    if (err) {
      alert('Gagal tambah rute: ' + err.message)
      return
    }

    alert('Rute berhasil ditambahkan!')
    const { data: ruteData } = await supabase.from('master_rute').select('*').eq('operator_id', profile.id)
    setMasterRuteList(ruteData || [])
    ;(e.target as any).reset()
  }

  async function handleEditHarga(id: string) {
    const { error: err } = await supabase
      .from('master_rute')
      .update({ harga: parseInt(editHargaValue) })
      .eq('id', id)

    if (err) {
      alert('Gagal update harga: ' + err.message)
      return
    }
    setEditHargaId(null)
    const { data: ruteData } = await supabase.from('master_rute').select('*').eq('operator_id', profile?.id)
    setMasterRuteList(ruteData || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    setPesanSukses('')
    setSedangSimpan(true)

    if (!form.kapal_id || !form.rute_asal || !form.rute_tujuan) {
      setError('Semua field wajib diisi')
      setSedangSimpan(false)
      return
    }

    const jamBerangkat = `${form.jam}:${form.menit}`

    const ruteCocok = masterRuteList.find(
      (r) => r.rute_asal === form.rute_asal && r.rute_tujuan === form.rute_tujuan
    )
    const harga = ruteCocok ? ruteCocok.harga : 0

    const payload = {
      kapal_id: form.kapal_id,
      rute_asal: form.rute_asal,
      rute_tujuan: form.rute_tujuan,
      jam_berangkat: jamBerangkat,
      aktif: true,
      operator_id: profile.id,
      harga: harga,
      kapasitas: parseInt(form.kapasitas) || 0, // <-- Simpan Jumlah Kursi
    }

    if (editId) {
      const { error: errUpdate } = await supabase.from('template_jadwal').update(payload).eq('id', editId)
      if (errUpdate) {
        setError('Gagal update: ' + errUpdate.message)
        setSedangSimpan(false)
        return
      }
      setPesanSukses('Jadwal berhasil diupdate!')
      setEditId(null)
    } else {
      const { error: errInsert } = await supabase.from('template_jadwal').insert(payload)
      if (errInsert) {
        setError('Gagal simpan: ' + errInsert.message)
        setSedangSimpan(false)
        return
      }
      setPesanSukses('Jadwal berhasil disimpan!')
    }

    const { data: templateData } = await supabase
      .from('template_jadwal')
      .select('*')
      .eq('operator_id', profile.id)
      .order('jam_berangkat', { ascending: true })
    setTemplateList(templateData || [])
    setSedangSimpan(false)

    setForm({ ...form, kapal_id: '', rute_asal: '', rute_tujuan: '', kapasitas: '0' })
  }

  async function handleHapus(id: string) {
    if (!confirm('Yakin mau hapus jadwal ini?')) return
    const { error: errDelete } = await supabase.from('template_jadwal').delete().eq('id', id)
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
      kapasitas: (t.kapasitas || 0).toString(),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function batalEdit() {
    setEditId(null)
    setForm({ kapal_id: '', rute_asal: '', rute_tujuan: '', jam: '07', menit: '00', kapasitas: '0' })
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat...</p>
  if (error && !profile) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  const groupedTemplates = templateList.reduce((acc, t) => {
    const key = `${t.rute_asal} - ${t.rute_tujuan}`
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, Template[]>)

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manajemen Jadwal</h1>
            <p className="text-sm text-gray-700">Atur harga per rute, lalu tambahkan jadwal kapal.</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline px-2 font-medium">
            ← Kembali
          </button>
        </div>

        {/* MASTER RUTE & HARGA */}
        <div className="bg-white p-6 rounded shadow mb-6 border-l-4 border-blue-500">
          <h2 className="font-bold text-gray-900 mb-4 text-lg">Master Rute & Harga</h2>
          
          <div className="space-y-3 mb-6">
            {masterRuteList.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Belum ada rute yang diatur. Silakan tambah rute dulu.</p>
            ) : (
              masterRuteList.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 p-3 rounded border">
                  <span className="font-medium text-gray-800">{r.rute_asal} - {r.rute_tujuan}</span>
                  {editHargaId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={editHargaValue} 
                        onChange={(e) => setEditHargaValue(e.target.value)} 
                        className="border rounded px-2 py-1 text-sm w-28 text-gray-900" 
                      />
                      <button onClick={() => handleEditHarga(r.id)} className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">Simpan</button>
                      <button onClick={() => setEditHargaId(null)} className="bg-gray-400 text-white px-2 py-1 rounded text-xs">Batal</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-blue-600">Rp {r.harga.toLocaleString('id-ID')}</span>
                      <button onClick={() => { setEditHargaId(r.id); setEditHargaValue(r.harga.toString()) }} className="text-blue-500 hover:text-blue-700 text-sm">✏️ Edit</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Form Tambah Rute Baru - HARGA DEFAULT 0 */}
          <form onSubmit={handleTambahRute} className="flex flex-wrap gap-2 items-end bg-blue-50 p-3 rounded border border-blue-200">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Rute Asal</label>
              <select name="asal" className="border rounded px-2 py-1.5 text-sm text-gray-900" required>
                <option value="">- Pilih -</option>
                {DAFTAR_RUTE.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Rute Tujuan</label>
              <select name="tujuan" className="border rounded px-2 py-1.5 text-sm text-gray-900" required>
                <option value="">- Pilih -</option>
                {DAFTAR_RUTE.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Harga (Rp)</label>
              <input name="harga" type="number" defaultValue={0} className="border rounded px-2 py-1.5 text-sm w-28 text-gray-900" required />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-blue-700">+ Tambah Rute</button>
          </form>
        </div>

        {/* FORM TAMBAH JADWAL */}
        <div className="bg-white p-6 rounded shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">{editId ? 'Edit Jadwal' : 'Tambah Jadwal Kapal'}</h2>
            {editId && <button onClick={batalEdit} className="text-sm text-red-600 hover:underline">Batal Edit</button>}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Rute</label>
                <div className="flex gap-2">
                  <select
                    value={form.rute_asal}
                    onChange={(e) => setForm({ ...form, rute_asal: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-gray-900"
                    required
                  >
                    <option value="">-- Asal --</option>
                    {DAFTAR_RUTE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select
                    value={form.rute_tujuan}
                    onChange={(e) => setForm({ ...form, rute_tujuan: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-gray-900"
                    required
                  >
                    <option value="">-- Tujuan --</option>
                    {DAFTAR_RUTE.map((r) => <option key={r} value={r} disabled={r === form.rute_asal}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Kapal</label>
                <select
                  value={form.kapal_id}
                  onChange={(e) => setForm({ ...form, kapal_id: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-gray-900"
                  required
                >
                  <option value="">-- Pilih Kapal --</option>
                  {kapalList.map((k) => <option key={k.id} value={k.id}>{k.nama} ({k.kapasitas} kursi)</option>)}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Jam Berangkat</label>
                <div className="flex gap-2 items-center">
                  <select value={form.jam} onChange={(e) => setForm({ ...form, jam: e.target.value })} className="border rounded px-3 py-2 text-gray-900 w-full" required>
                    {JAM_OPTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                  <span className="font-bold text-gray-700">:</span>
                  <select value={form.menit} onChange={(e) => setForm({ ...form, menit: e.target.value })} className="border rounded px-3 py-2 text-gray-900 w-full" required>
                    {MENIT_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* KOLOM JUMLAH KURSI (BARU) */}
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">Jumlah Kursi (Manual)</label>
                <input
                  type="number"
                  value={form.kapasitas}
                  onChange={(e) => setForm({ ...form, kapasitas: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-gray-900"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Default: 0. Isi manual (misal 20, 25, 60).</p>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {pesanSukses && <p className="text-green-600 text-sm">{pesanSukses}</p>}

            <button type="submit" disabled={sedangSimpan} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 font-bold">
              {sedangSimpan ? 'Menyimpan...' : editId ? 'Update Jadwal' : 'Tambah Jadwal ke Daftar'}
            </button>
          </form>
        </div>

        {/* DAFTAR JADWAL (GROUPING) */}
        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold text-gray-900 mb-4 text-lg">Daftar Jadwal Keberangkatan</h2>

          {templateList.length === 0 ? (
            <p className="text-gray-500 text-sm italic">Belum ada jadwal kapal.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTemplates).map(([ruteKey, list]) => {
                const ruteMaster = masterRuteList.find(r => `${r.rute_asal} - ${r.rute_tujuan}` === ruteKey)
                return (
                  <div key={ruteKey} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">📁 {ruteKey}</h3>
                      <span className="text-sm font-bold text-blue-600">
                        {ruteMaster ? `Rp ${ruteMaster.harga.toLocaleString('id-ID')}` : 'Harga belum diatur'}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 border-b">
                        <tr>
                          <th className="text-left px-4 py-2">Nama Kapal</th>
                          <th className="text-center px-4 py-2">Jumlah Kursi</th>
                          <th className="text-center px-4 py-2">Jam Berangkat</th>
                          <th className="text-center px-4 py-2 w-32">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((t) => {
                          const kapal = kapalList.find((k) => k.id === t.kapal_id)
                          return (
                            <tr key={t.id} className="border-t hover:bg-gray-50">
                              <td className="px-4 py-2 font-medium text-gray-900">{kapal?.nama || '(Kapal dihapus)'}</td>
                              <td className="px-4 py-2 text-center text-gray-700">{t.kapasitas || 0} kursi</td>
                              <td className="px-4 py-2 text-center font-bold text-gray-800">{t.jam_berangkat.slice(0, 5)}</td>
                              <td className="px-4 py-2 text-center space-x-2">
                                <button onClick={() => handleEdit(t)} className="text-blue-600 hover:underline">Edit</button>
                                <button onClick={() => handleHapus(t.id)} className="text-red-600 hover:underline">Hapus</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="text-center mt-6 pb-10">
          <a href="/dashboard" className="text-blue-600 text-sm hover:underline">← Kembali ke Dashboard</a>
        </div>
      </div>
    </div>
  )
}