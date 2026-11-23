'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, formatDaftarAbk, type Profile } from '@/lib/supabase'
import { bersihkanJadwalTurunan } from '@/lib/bersihJadwal'

type Kapal = {
  id: string
  nama: string
  kapasitas: number
  layout_kursi: string | null
  status: string
  catatan: string | null
  nama_kapten: string | null
  nama_abk: string[] | null
}

// Pesan bila Supabase menolak simpan (update/insert 0 baris) — biasanya hak akses tabel kapal.
const SQL_IZIN_KAPAL = `Data TIDAK tersimpan (Supabase menolak perubahan). Jalankan SQL ini di Supabase lalu simpan ulang:

alter table public.kapal enable row level security;
drop policy if exists "kapal_all" on public.kapal;
create policy "kapal_all" on public.kapal for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.kapal to anon, authenticated;`

function KapalContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [loading, setLoading] = useState(true)
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nama, setNama] = useState('')
  const [kapasitas, setKapasitas] = useState('')
  const [layout, setLayout] = useState('tanpa_layout')
  const [namaKapten, setNamaKapten] = useState('')
  const [daftarAbk, setDaftarAbk] = useState<string[]>([''])
  const [status, setStatus] = useState('aktif')
  const [catatan, setCatatan] = useState('')
  const [proses, setProses] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) { router.push('/login'); return }
      
      if (p.role !== 'admin_utama' && p.role !== 'superadmin') {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }
      
      setProfile(p)
      fetchData(p)
    }
    init()
  }, [router])

  async function fetchData(p: Profile) {
    setLoading(true)
    let query = supabase.from('kapal').select('*').order('nama')
    if (p.role !== 'superadmin') {
      query = query.eq('operator_id', p.id)
    }
    const { data } = await query
    setKapalList(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setEditId(null)
    setNama('')
    setKapasitas('')
    setLayout('tanpa_layout')
    setNamaKapten('')
    setDaftarAbk([''])
    setStatus('aktif')
    setCatatan('')
    setError('')
  }

  const handleEdit = (k: Kapal) => {
    setEditId(k.id)
    setNama(k.nama)
    setKapasitas(k.kapasitas.toString())
    setLayout(k.layout_kursi || 'tanpa_layout')
    setNamaKapten(k.nama_kapten || '')
    setDaftarAbk(k.nama_abk && k.nama_abk.length > 0 ? k.nama_abk : [''])
    setStatus(k.status)
    setCatatan(k.catatan || '')
    setShowForm(true)
  }

  const handleHapus = async (id: string) => {
    const kapal = kapalList.find((k) => k.id === id)
    if (
      !confirm(
        `Hapus kapal "${kapal?.nama || ''}"?\n\nSemua template jadwalnya ikut dihapus dan jadwal tanggal mendatang yang belum ada penjualan ikut dibersihkan (yang sudah ada penjualan hanya dinonaktifkan).`
      )
    )
      return
    setLoading(true)

    // Template jadwal milik kapal ini pasti sudah tidak berlaku.
    await supabase.from('template_jadwal').delete().eq('kapal_id', id)

    // Bersihkan jadwal yang sudah tergenerate, kalau tidak kapal ini masih muncul
    // di pencarian tiket online walau sudah "dihapus".
    const hasil = await bersihkanJadwalTurunan(supabase, { kapal_id: id })

    const { error } = await supabase.from('kapal').delete().eq('id', id)
    if (error) {
      // Biasanya karena jadwal lama (sudah ada penjualan) masih mereferensikan kapal.
      // Jangan hapus riwayat tiket: nonaktifkan kapal + jadwalnya saja.
      await supabase.from('kapal').update({ status: 'nonaktif' }).eq('id', id)
      alert(
        `Kapal ini sudah punya riwayat penjualan, jadi tidak bisa dihapus permanen (Supabase: ${error.message}).\n\n` +
          `Kapal & ${hasil.dinonaktifkan} jadwalnya sudah DINONAKTIFKAN — tidak akan muncul lagi di pencarian tiket online.`
      )
    } else if (hasil.dinonaktifkan > 0) {
      alert(`Kapal dihapus. ${hasil.dihapus} jadwal mendatang dihapus, ${hasil.dinonaktifkan} jadwal berisi penjualan dinonaktifkan.`)
    }

    if (profile) fetchData(profile)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!nama || !kapasitas) {
      setError('Nama dan Kapasitas wajib diisi')
      return
    }

    setProses(true)
    setError('')

    try {
      const payload = {
        nama,
        kapasitas: parseInt(kapasitas),
        layout_kursi: layout,
        nama_kapten: namaKapten || null,
        nama_abk: daftarAbk.map((n) => n.trim()).filter((n) => n !== ''),
        status,
        catatan: catatan || null,
        operator_id: profile.role === 'superadmin' && !editId ? profile.id : (profile.role === 'admin_utama' ? profile.id : undefined)
      }

      if (editId) {
        const { data: hasilUpd, error: errUpd } = await supabase
          .from('kapal')
          .update(payload)
          .eq('id', editId)
          .select('id')

        if (errUpd) throw errUpd
        if (!hasilUpd || hasilUpd.length === 0) throw new Error(SQL_IZIN_KAPAL)
      } else {
        const finalPayload = {
          ...payload,
          operator_id: profile.id
        }
        const { data: hasilIns, error: errIns } = await supabase
          .from('kapal')
          .insert(finalPayload)
          .select('id')

        if (errIns) throw errIns
        if (!hasilIns || hasilIns.length === 0) throw new Error(SQL_IZIN_KAPAL)
      }

      setShowForm(false)
      resetForm()
      fetchData(profile)
    } catch (err: any) {
      const pesan = err?.message || 'Terjadi kesalahan'
      if (pesan.includes('nama_abk')) {
        setError("Kolom ABK belum ada di database. Jalankan dulu di Supabase: alter table public.kapal add column if not exists nama_abk text[] default '{}';")
      } else {
        setError(pesan)
      }
    } finally {
      setProses(false)
    }
  }

  if (loading && kapalList.length === 0) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error && kapalList.length === 0) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Daftar Armada Kapal</h1>
            <p className="text-sm text-gray-600">Kelola data kapal dan kapten Anda</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => { resetForm(); setShowForm(!showForm) }}
              className="flex-1 sm:flex-none whitespace-nowrap bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Kapal'}
            </button>
            <button 
              onClick={() => router.push('/dashboard')} 
              className="flex-1 sm:flex-none whitespace-nowrap text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors shadow-sm font-medium"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Edit Kapal' : 'Tambah Kapal Baru'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapal</label>
                  <input type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: SB. Andalas 1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas Kursi</label>
                  <input type="number" value={kapasitas} onChange={e => setKapasitas(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: 60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kapten</label>
                  <input type="text" value={namaKapten} onChange={e => setNamaKapten(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: Budi" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama ABK</label>
                  <div className="space-y-2">
                    {daftarAbk.map((namaAbkItem, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={namaAbkItem}
                          onChange={(e) => {
                            const baru = [...daftarAbk]
                            baru[idx] = e.target.value
                            setDaftarAbk(baru)
                          }}
                          className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Nama ABK ${idx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setDaftarAbk(daftarAbk.length === 1 ? [''] : daftarAbk.filter((_, i) => i !== idx))}
                          className="px-3 py-2 bg-red-50 text-red-600 rounded-md text-sm font-medium hover:bg-red-100"
                          title="Hapus ABK"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDaftarAbk([...daftarAbk, ''])}
                    className="mt-2 text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md font-medium hover:bg-blue-100"
                  >
                    + Tambah ABK
                  </button>
                  <p className="text-xs text-gray-500 mt-1">Satu kolom untuk satu orang ABK.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Layout Kursi</label>
                  <select value={layout} onChange={e => setLayout(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="tanpa_layout">Tanpa Layout (Grid)</option>
                    <option value="2-3">2 - 3 (Kiri 2, Kanan 3)</option>
                    <option value="3-2">3 - 2 (Kiri 3, Kanan 2)</option>
                    <option value="2-2">2 - 2 (Kiri 2, Kanan 2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (Opsional)</label>
                <textarea value={catatan} onChange={e => setCatatan(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" rows={2}></textarea>
              </div>

              {error && <p className="text-red-500 text-sm whitespace-pre-line">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Batal</button>
                <button type="submit" disabled={proses} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                  {proses ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {kapalList.map(k => (
            <div key={k.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row items-center gap-4">
              
              <div className="w-full md:w-auto flex-shrink-0">
                <span className={`inline-block text-xs px-3 py-1.5 rounded-md font-bold ${k.status === 'aktif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {k.status.toUpperCase()}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center w-full md:border-l md:border-gray-200 md:pl-4">
                <h3 className="font-bold text-lg text-gray-900 mb-1">{k.nama}</h3>
                <div className="text-sm text-gray-600 flex flex-col md:flex-row gap-2 md:gap-6">
                  <p>Kapasitas: <span className="font-medium text-gray-900">{k.kapasitas} Kursi</span></p>
                  <p>Kapten: <span className="font-medium text-gray-900">{k.nama_kapten || '-'}</span></p>
                  <p>ABK: <span className="font-medium text-gray-900">{formatDaftarAbk(k.nama_abk)}</span></p>
                  {k.catatan && <p className="italic text-xs self-end md:self-auto text-gray-400">"{k.catatan}"</p>}
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto items-center justify-end mt-2 md:mt-0">
                <button onClick={() => handleEdit(k)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded text-sm font-medium hover:bg-blue-100 transition-colors">Edit</button>
                <button onClick={() => handleHapus(k.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100 transition-colors">Hapus</button>
              </div>
            </div>
          ))}
        </div>

        {kapalList.length === 0 && !loading && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">Belum ada data kapal.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function KapalPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <KapalContent />
    </Suspense>
  )
}