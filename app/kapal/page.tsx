'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type TemplateJadwal = {
  id: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  harga: number
  aktif: boolean
  kapasitas: number
  kapal?: { nama: string, kapasitas: number }
}

type Kapal = {
  id: string
  nama: string
  kapasitas: number
}

type MasterRute = {
  id: string
  rute_asal: string
  rute_tujuan: string
  harga: number
}

function TemplateJadwalContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  
  const [templateList, setTemplateList] = useState<TemplateJadwal[]>([])
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [ruteList, setRuteList] = useState<MasterRute[]>([])
  
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  
  // Form state (Tambah/Edit)
  const [kapalId, setKapalId] = useState('')
  const [ruteAsal, setRuteAsal] = useState('')
  const [ruteTujuan, setRuteTujuan] = useState('')
  const [jamBerangkat, setJamBerangkat] = useState('')
  const [harga, setHarga] = useState('')
  const [jumlahKursi, setJumlahKursi] = useState('')
  const [aktif, setAktif] = useState(true)
  
  // State untuk Modal Ubah Harga Massal
  const [showMassalForm, setShowMassalForm] = useState(false)
  const [massalAsal, setMassalAsal] = useState('')
  const [massalTujuan, setMassalTujuan] = useState('')
  const [massalHarga, setMassalHarga] = useState('')
  
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
        setError('Anda tidak punya akses')
        setLoading(false)
        return
      }
      setProfile(p)
      await fetchData(p)
    }
    init()
  }, [router])

  async function fetchData(p: Profile) {
    setLoading(true)
    
    // Fetch Kapal
    let qKapal = supabase.from('kapal').select('id, nama, kapasitas').order('nama')
    if (p.role !== 'superadmin') qKapal = qKapal.eq('operator_id', p.id)
    const { data: kData } = await qKapal
    setKapalList(kData || [])

    // Fetch Master Rute
    let qRute = supabase.from('master_rute').select('*').order('rute_asal')
    if (p.role !== 'superadmin') qRute = qRute.eq('operator_id', p.id)
    const { data: rData } = await qRute
    setRuteList(rData || [])

    // Fetch Template Jadwal
    let qTemplate = supabase.from('template_jadwal').select('*, kapal:kapal_id(nama, kapasitas)').order('jam_berangkat')
    if (p.role !== 'superadmin') qTemplate = qTemplate.eq('operator_id', p.id)
    const { data: tData } = await qTemplate
    setTemplateList(tData || [])

    setLoading(false)
  }

  const resetForm = () => {
    setEditId(null)
    setKapalId('')
    setRuteAsal('')
    setRuteTujuan('')
    setJamBerangkat('')
    setHarga('')
    setJumlahKursi('')
    setAktif(true)
    setError('')
  }

  const handleEdit = (t: TemplateJadwal) => {
    setEditId(t.id)
    setKapalId(t.kapal_id)
    setRuteAsal(t.rute_asal)
    setRuteTujuan(t.rute_tujuan)
    setJamBerangkat(t.jam_berangkat)
    setHarga(t.harga.toString())
    setJumlahKursi(t.kapasitas?.toString() || '')
    setAktif(t.aktif)
    setShowForm(true)
  }

  const handleHapus = async (id: string) => {
    if (!confirm('Hapus jadwal ini?')) return
    setLoading(true)
    await supabase.from('template_jadwal').delete().eq('id', id)
    if (profile) fetchData(profile)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!kapalId || !ruteAsal || !ruteTujuan || !jamBerangkat) {
      setError('Semua field bertanda * wajib diisi')
      return
    }

    setProses(true)
    setError('')

    try {
      let finalHarga = parseInt(harga) || 0
      if (!harga && ruteAsal && ruteTujuan) {
        const rute = ruteList.find(r => r.rute_asal === ruteAsal && r.rute_tujuan === ruteTujuan)
        if (rute) finalHarga = rute.harga
      }

      const kapasitasFinal = jumlahKursi ? parseInt(jumlahKursi) : (kapalList.find(k => k.id === kapalId)?.kapasitas || 0)

      const payload = {
        kapal_id: kapalId,
        rute_asal: ruteAsal,
        rute_tujuan: ruteTujuan,
        jam_berangkat: jamBerangkat,
        harga: finalHarga,
        aktif,
        kapasitas: kapasitasFinal,
        operator_id: profile.id
      }

      if (editId) {
        const { error: errUpd } = await supabase.from('template_jadwal').update(payload).eq('id', editId)
        if (errUpd) throw errUpd
      } else {
        const { error: errIns } = await supabase.from('template_jadwal').insert(payload)
        if (errIns) throw errIns
      }

      setShowForm(false)
      resetForm()
      fetchData(profile)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProses(false)
    }
  }

  const handleUbahMassal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!massalAsal || !massalTujuan || !massalHarga) {
      alert('Lengkapi semua field ubah massal')
      return
    }

    if (!confirm(`Yakin ingin mengubah HARGA SEMUA KAPAL di rute ${massalAsal} - ${massalTujuan} menjadi Rp ${parseInt(massalHarga).toLocaleString('id-ID')}?`)) return

    setProses(true)
    try {
      const hrg = parseInt(massalHarga)
      
      // Update semua jadwal di rute tersebut
      const { error: errUpdate } = await supabase
        .from('template_jadwal')
        .update({ harga: hrg })
        .eq('rute_asal', massalAsal)
        .eq('rute_tujuan', massalTujuan)
        .eq('operator_id', profile.id)

      if (errUpdate) throw errUpdate

      // Update juga di master_rute agar sinkron
      await supabase
        .from('master_rute')
        .update({ harga: hrg })
        .eq('rute_asal', massalAsal)
        .eq('rute_tujuan', massalTujuan)
        .eq('operator_id', profile.id)

      alert('Harga berhasil diubah massal!')
      setShowMassalForm(false)
      setMassalHarga('')
      fetchData(profile)
    } catch (err: any) {
      alert('Gagal ubah massal: ' + err.message)
    } finally {
      setProses(false)
    }
  }

  const handlePilihRute = (asal: string, tujuan: string) => {
    setRuteAsal(asal)
    setRuteTujuan(tujuan)
    const rute = ruteList.find(r => r.rute_asal === asal && r.rute_tujuan === tujuan)
    if (rute) setHarga(rute.harga.toString())
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat data...</p>
  if (error && templateList.length === 0) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>

  const grouped = templateList.reduce((acc, curr) => {
    const key = `${curr.rute_asal} - ${curr.rute_tujuan}`
    if (!acc[key]) acc[key] = []
    acc[key].push(curr)
    return acc
  }, {} as Record<string, TemplateJadwal[]>)

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manajemen Jadwal</h1>
            <p className="text-sm text-gray-600">Atur template jadwal keberangkatan kapal</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => setShowMassalForm(!showMassalForm)}
              className="flex-1 md:flex-none bg-orange-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
            >
              💰 Ubah Harga Massal
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(!showForm) }}
              className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Jadwal'}
            </button>
            <button 
              onClick={() => router.push('/dashboard')} 
              className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors shadow-sm font-medium"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        {/* FORM UBAH HARGA MASSAL */}
        {showMassalForm && (
          <div className="bg-orange-50 p-5 rounded-xl shadow-sm border border-orange-200 mb-6">
            <h2 className="text-lg font-bold text-orange-900 mb-4">Ubah Harga Massal Per Rute</h2>
            <form onSubmit={handleUbahMassal} className="flex flex-col md:flex-row items-end gap-3">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Rute</label>
                <select 
                  onChange={e => {
                    const val = e.target.value
                    if (val) {
                      const [asal, tujuan] = val.split('|')
                      setMassalAsal(asal)
                      setMassalTujuan(tujuan)
                    }
                  }} 
                  className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-orange-500 focus:border-orange-500" 
                  required
                >
                  <option value="">-- Pilih Rute --</option>
                  {ruteList.map((r, idx) => (
                    <option key={idx} value={`${r.rute_asal}|${r.rute_tujuan}`}>{r.rute_asal} - {r.rute_tujuan}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Baru (Rp)</label>
                <input 
                  type="number" 
                  value={massalHarga} 
                  onChange={e => setMassalHarga(e.target.value)} 
                  className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-orange-500 focus:border-orange-500" 
                  placeholder="Contoh: 150000" 
                  required 
                />
              </div>
              <button type="submit" disabled={proses} className="w-full md:w-auto bg-orange-600 text-white px-6 py-2 rounded-md hover:bg-orange-700 disabled:opacity-50 font-medium">
                {proses ? 'Menyimpan...' : 'Simpan Massal'}
              </button>
            </form>
          </div>
        )}

        {/* FORM TAMBAH/EDIT JADWAL */}
        {showForm && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Kapal *</label>
                  <select value={kapalId} onChange={e => setKapalId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required>
                    <option value="">-- Pilih Kapal --</option>
                    {kapalList.map(k => (
                      <option key={k.id} value={k.id}>{k.nama} (Kap: {k.kapasitas})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Rute (Master)</label>
                  <select onChange={e => {
                    const val = e.target.value
                    if (val) {
                      const [asal, tujuan] = val.split('|')
                      handlePilihRute(asal, tujuan)
                    }
                  }} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">-- Pilih Rute --</option>
                    {ruteList.map((r, idx) => (
                      <option key={idx} value={`${r.rute_asal}|${r.rute_tujuan}`}>{r.rute_asal} - {r.rute_tujuan} (Rp {r.harga.toLocaleString('id-ID')})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rute Asal *</label>
                  <input type="text" value={ruteAsal} onChange={e => setRuteAsal(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rute Tujuan *</label>
                  <input type="text" value={ruteTujuan} onChange={e => setRuteTujuan(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Berangkat *</label>
                  <input type="time" value={jamBerangkat} onChange={e => setJamBerangkat(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp)</label>
                  <input type="number" value={harga} onChange={e => setHarga(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Otomatis dari master rute" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Kursi Manual</label>
                  <input type="number" value={jumlahKursi} onChange={e => setJumlahKursi(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Kosongkan untuk pakai kapasitas kapal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={aktif ? 'aktif' : 'nonaktif'} onChange={e => setAktif(e.target.value === 'aktif')} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Batal</button>
                <button type="submit" disabled={proses} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                  {proses ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-6">
          {Object.keys(grouped).length === 0 && !loading && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">Belum ada jadwal yang dibuat.</p>
            </div>
          )}

          {Object.entries(grouped).map(([rute, list]) => (
            <div key={rute} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Rute: {rute}</h3>
                <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">Harga Default: Rp {list[0]?.harga.toLocaleString('id-ID')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-gray-500 border-b">
                    <tr>
                      <th className="px-4 py-3">Jam</th>
                      <th className="px-4 py-3">Kapal</th>
                      <th className="px-4 py-3">Kapasitas</th>
                      <th className="px-4 py-3">Harga Spesifik</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold text-gray-900">{t.jam_berangkat.substring(0,5)}</td>
                        <td className="px-4 py-3">{t.kapal?.nama || '-'}</td>
                        <td className="px-4 py-3">{t.kapasitas || t.kapal?.kapasitas} Kursi</td>
                        <td className="px-4 py-3">Rp {t.harga.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${t.aktif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {t.aktif ? 'AKTIF' : 'NONAKTIF'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button onClick={() => handleEdit(t)} className="text-blue-600 hover:underline font-medium">Edit</button>
                          <button onClick={() => handleHapus(t.id)} className="text-red-600 hover:underline font-medium">Hapus</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TemplateJadwalPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <TemplateJadwalContent />
    </Suspense>
  )
}