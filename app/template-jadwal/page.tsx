'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { idOperator } from '@/lib/tenant'
import { SEMUA_HARI, LABEL_HARI, labelHari, hariOperasiAktif, type NamaHari } from '@/lib/hari'

type TemplateJadwal = {
  id: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  harga: number
  aktif: boolean
  kapasitas: number
  hari_operasi?: string[] | null
  kapal?: { nama: string, kapasitas: number }
}

type Kapal = {
  id: string
  nama: string
  kapasitas: number
}

// Daftar daerah/rute baku dari Superadmin (tabel master_kota).
// Dipakai SEMUA penyewa — tidak ada daftar daerah per penyewa.
type Kota = {
  id: string
  nama_kota: string
  singkatan: string
}

function TemplateJadwalContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  
  const [templateList, setTemplateList] = useState<TemplateJadwal[]>([])
  const [kapalList, setKapalList] = useState<Kapal[]>([])
  const [kotaList, setKotaList] = useState<Kota[]>([])
  
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  
  // Form state (Tambah/Edit)
  const [kapalId, setKapalId] = useState('')
  const [ruteAsal, setRuteAsal] = useState('')
  const [ruteTujuan, setRuteTujuan] = useState('')
  const [jamBerangkat, setJamBerangkat] = useState('')
  const [harga, setHarga] = useState('')
  const [aktif, setAktif] = useState(true)
  // Hari operasi kapal (default semua hari tercentang)
  const [hariOperasi, setHariOperasi] = useState<NamaHari[]>([...SEMUA_HARI])
  
  const [proses, setProses] = useState(false)
  const [error, setError] = useState('')
  const [aksesError, setAksesError] = useState('')

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) { router.push('/login'); return }
      if (p.role !== 'admin_utama' && p.role !== 'superadmin') {
        setAksesError('Anda tidak punya akses')
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
    const operatorId = idOperator(p)
    
    // Fetch Kapal — kapasitas kursi HANYA diisi di Manajemen Kapal
    let qKapal = supabase.from('kapal').select('id, nama, kapasitas').order('nama')
    if (operatorId) qKapal = qKapal.eq('operator_id', operatorId)
    const { data: kData } = await qKapal
    const kList = kData || []
    setKapalList(kList)

    // Fetch daftar daerah baku (Superadmin -> Pusat Kontrol -> Master Rute / Kamus Kota)
    const { data: kotaData } = await supabase
      .from('master_kota')
      .select('id, nama_kota, singkatan')
      .order('nama_kota')
    setKotaList(kotaData || [])

    // Fetch Template Jadwal
    let qTemplate = supabase.from('template_jadwal').select('*').order('jam_berangkat')
    if (operatorId) qTemplate = qTemplate.eq('operator_id', operatorId)
    const { data: tData } = await qTemplate
    
    const tDataWithKapal = (tData || []).map(t => {
      const kapal = kList.find(k => k.id === t.kapal_id)
      return {
        ...t,
        kapal: kapal ? { nama: kapal.nama, kapasitas: kapal.kapasitas } : null
      }
    })
    
    setTemplateList(tDataWithKapal)
    setLoading(false)
  }

  const resetForm = () => {
    setEditId(null)
    setKapalId('')
    setRuteAsal('')
    setRuteTujuan('')
    setJamBerangkat('')
    setHarga('')
    setAktif(true)
    setHariOperasi([...SEMUA_HARI])
    setError('')
  }

  const handleEdit = (t: TemplateJadwal) => {
    setEditId(t.id)
    setKapalId(t.kapal_id)
    setRuteAsal(t.rute_asal)
    setRuteTujuan(t.rute_tujuan)
    setJamBerangkat(t.jam_berangkat)
    setHarga(t.harga.toString())
    setAktif(t.aktif)
    setHariOperasi(hariOperasiAktif(t.hari_operasi))
    setShowForm(true)
  }

  const toggleHari = (h: NamaHari) => {
    setHariOperasi(prev =>
      SEMUA_HARI.filter(x => (x === h ? !prev.includes(x) : prev.includes(x)))
    )
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
    if (!kapalId || !ruteAsal || !ruteTujuan || !jamBerangkat || !harga) {
      setError('Pilih kapal, rute asal, rute tujuan, jam berangkat, dan isi harga')
      return
    }
    if (ruteAsal === ruteTujuan) {
      setError('Rute asal dan rute tujuan tidak boleh sama')
      return
    }
    const hargaFinal = parseInt(harga)
    if (!hargaFinal || hargaFinal <= 0) {
      setError('Harga harus lebih dari 0')
      return
    }
    if (hariOperasi.length === 0) {
      setError('Pilih minimal satu hari operasi kapal')
      return
    }

    setProses(true)
    setError('')

    try {
      // Kapasitas kursi tidak diisi di sini — selalu ikut data armada kapal.
      const kapal = kapalList.find(k => k.id === kapalId)
      if (!kapal || !kapal.kapasitas) {
        throw new Error('Kapasitas kapal belum diisi. Lengkapi dulu di Manajemen Kapal.')
      }

      const payload = {
        kapal_id: kapalId,
        rute_asal: ruteAsal,
        rute_tujuan: ruteTujuan,
        jam_berangkat: jamBerangkat,
        harga: hargaFinal,
        aktif,
        hari_operasi: SEMUA_HARI.filter(h => hariOperasi.includes(h)),
        kapasitas: kapal.kapasitas,
        operator_id: idOperator(profile) || profile.id
      }

      if (editId) {
        const lama = templateList.find(t => t.id === editId)
        const { error: errUpd } = await supabase.from('template_jadwal').update(payload).eq('id', editId)
        if (errUpd) throw errUpd

        // Harga hanya bisa diubah dari halaman ini. Kalau harganya berubah,
        // ikutkan ke jadwal mendatang yang belum punya penjualan sama sekali.
        if (!lama || Number(lama.harga) !== hargaFinal) {
          await sinkronHargaJadwalMendatang(kapalId, ruteAsal, ruteTujuan, jamBerangkat, hargaFinal)
        }
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

  // Harga tiket HANYA boleh berubah dari Manajemen Jadwal.
  // Saat harga sebuah rute diubah, jadwal mendatang yang belum punya penjualan
  // ikut disesuaikan supaya tidak ada harga lama/karangan yang terpakai.
  async function sinkronHargaJadwalMendatang(
    kapalId: string,
    asal: string,
    tujuan: string,
    jam: string,
    hargaBaru: number
  ) {
    const hariIni = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: jadwalTerkait } = await supabase
      .from('jadwal')
      .select('id')
      .eq('kapal_id', kapalId)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)
      .eq('jam_berangkat', jam)
      .gte('tanggal', hariIni)

    const ids = (jadwalTerkait || []).map((j: any) => j.id)
    if (ids.length === 0) return

    const { data: sudahDijual } = await supabase
      .from('pesanan')
      .select('jadwal_id')
      .in('jadwal_id', ids)

    const terjual = new Set((sudahDijual || []).map((p: any) => p.jadwal_id))
    const bolehDiubah = ids.filter((id: string) => !terjual.has(id))
    if (bolehDiubah.length === 0) return

    await supabase.from('jadwal').update({ harga: hargaBaru }).in('id', bolehDiubah)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat data...</p>
  if (aksesError) return <p className="p-6 text-center text-red-600 mt-10">{aksesError}</p>

  // Kelompokkan per NAMA KAPAL dulu, baru per rute.
  // Tujuan: semua rute yang dilayani satu kapal terlihat dalam satu kartu,
  // jadi gampang dikontrol (kapal mana melayani rute apa saja).
  type KelompokKapal = {
    nama: string
    kapasitas: number
    total: number
    rute: Record<string, TemplateJadwal[]>
  }

  const perKapal = Object.values(
    templateList.reduce((acc, curr) => {
      const namaKapal = curr.kapal?.nama || 'Kapal tidak dikenal'
      if (!acc[namaKapal]) {
        acc[namaKapal] = {
          nama: namaKapal,
          kapasitas: curr.kapal?.kapasitas || curr.kapasitas || 0,
          total: 0,
          rute: {},
        }
      }
      const namaRute = `${curr.rute_asal} - ${curr.rute_tujuan}`
      if (!acc[namaKapal].rute[namaRute]) acc[namaKapal].rute[namaRute] = []
      acc[namaKapal].rute[namaRute].push(curr)
      acc[namaKapal].total += 1
      return acc
    }, {} as Record<string, KelompokKapal>)
  ).sort((a, b) => a.nama.localeCompare(b.nama))

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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rute Asal *</label>
                  <select
                    value={ruteAsal}
                    onChange={e => setRuteAsal(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                    disabled={kotaList.length === 0}
                    required
                  >
                    <option value="">-- Pilih Daerah Asal --</option>
                    {ruteAsal && !kotaList.some(k => k.nama_kota === ruteAsal) && (
                      <option value={ruteAsal}>{ruteAsal}</option>
                    )}
                    {kotaList.filter(k => k.nama_kota !== ruteTujuan).map(k => (
                      <option key={k.id} value={k.nama_kota}>{k.nama_kota}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rute Tujuan *</label>
                  <select
                    value={ruteTujuan}
                    onChange={e => setRuteTujuan(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                    disabled={kotaList.length === 0}
                    required
                  >
                    <option value="">-- Pilih Daerah Tujuan --</option>
                    {ruteTujuan && !kotaList.some(k => k.nama_kota === ruteTujuan) && (
                      <option value={ruteTujuan}>{ruteTujuan}</option>
                    )}
                    {kotaList.filter(k => k.nama_kota !== ruteAsal).map(k => (
                      <option key={k.id} value={k.nama_kota}>{k.nama_kota}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Berangkat *</label>
                  <input type="time" value={jamBerangkat} onChange={e => setJamBerangkat(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp) *</label>
                  <input type="number" min={1} value={harga} onChange={e => setHarga(e.target.value)} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Contoh: 145000" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={aktif ? 'aktif' : 'nonaktif'} onChange={e => setAktif(e.target.value === 'aktif')} className="w-full border rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hari Operasi *</label>
                  <div className="flex flex-wrap gap-2">
                    {SEMUA_HARI.map(h => {
                      const dipilih = hariOperasi.includes(h)
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => toggleHari(h)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            dipilih
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {LABEL_HARI[h]}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Klik hari untuk mengaktifkan/menonaktifkan. Contoh kapal yang hanya jalan 3x seminggu: pilih <b>Senin</b>, <b>Rabu</b>, <b>Jumat</b>.
                    Jadwal otomatis hanya dibuat pada hari yang dipilih.
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Kapasitas kursi otomatis mengikuti isian &quot;Kapasitas Kursi&quot; di Manajemen Kapal.
                Harga tiket HANYA bisa diubah di halaman ini (Manajemen Jadwal).
                Kalau harga diubah, jadwal mendatang yang belum ada penjualan otomatis ikut menyesuaikan;
                tiket yang sudah terjual tidak berubah.
              </p>

              {kotaList.length === 0 && (
                <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
                  Daftar daerah belum diisi. Minta Superadmin mengisi di Pusat Kontrol &rarr; Master Rute (Kamus Kota).
                </p>
              )}

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
          {perKapal.length === 0 && !loading && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">Belum ada jadwal yang dibuat.</p>
            </div>
          )}

          {perKapal.map((kapal) => {
            // Rute diurutkan sesuai jam keberangkatan paling awal.
            const daftarRute = Object.entries(kapal.rute).sort((a, b) => {
              const jamA = a[1][0]?.jam_berangkat || ''
              const jamB = b[1][0]?.jam_berangkat || ''
              return jamA.localeCompare(jamB) || a[0].localeCompare(b[0])
            })

            return (
              <div key={kapal.nama} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header kapal */}
                <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900">{kapal.nama}</h3>
                    <p className="text-xs text-gray-600">
                      Kapasitas {kapal.kapasitas} kursi &middot; {daftarRute.length} rute
                    </p>
                  </div>
                  <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-medium">
                    {kapal.total} jadwal
                  </span>
                </div>

                <div className="divide-y divide-gray-100">
                  {daftarRute.map(([namaRute, list]) => (
                    <div key={namaRute}>
                      <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
                        <p className="text-sm font-bold text-gray-800">Rute: {namaRute}</p>
                        <span className="text-[11px] text-gray-500">{list.length} jadwal</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-white text-gray-500 border-b">
                            <tr>
                              <th className="px-4 py-3">Jam</th>
                              <th className="px-4 py-3">Harga</th>
                              <th className="px-4 py-3">Hari</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {list.map(t => (
                              <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-bold text-gray-900">{t.jam_berangkat.substring(0,5)}</td>
                                <td className="px-4 py-3 text-gray-900">Rp {t.harga.toLocaleString('id-ID')}</td>
                                <td className="px-4 py-3 text-gray-900 text-xs">{labelHari(t.hari_operasi)}</td>
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
            )
          })}
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