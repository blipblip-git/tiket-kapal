'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile } from '@/lib/supabase'

type Penumpang = {
  id: string
  nama: string
  nik: string
  nomor_hp: string
  kursi: string
  kanal: string
  kode_tiket: string
  status_boarding: string
}

function DaftarPenumpangContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const jadwalId = searchParams.get('jadwal')

  const [penumpangList, setPenumpangList] = useState<Penumpang[]>([])
  const [detailJadwal, setDetailJadwal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      const sesi = getOperatorSession()
      if (!sesi) {
        const p = await getProfile()
        if (!p || p.role !== 'admin_utama') {
          router.push('/login')
          return
        }
      }

      if (!jadwalId) {
        setError('Jadwal tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: j, error: errJ } = await supabase
        .from('jadwal')
        .select('id, rute_asal, rute_tujuan, tanggal, jam_berangkat, kapal_id, status_jadwal')
        .eq('id', jadwalId)
        .single()

      if (errJ || !j) {
        setError('Jadwal tidak ditemukan di database.')
        setLoading(false)
        return
      }

      let namaKapal = '-'
      if (j.kapal_id) {
        const { data: kap } = await supabase.from('kapal').select('nama').eq('id', j.kapal_id).single()
        if (kap) namaKapal = kap.nama
      }

      setDetailJadwal({ ...j, nama_kapal: namaKapal })

      const { data: pesananData, error: errP } = await supabase
        .from('pesanan')
        .select('id, nama_penumpang, nik, nomor_hp, kursi_id, kanal, kode_tiket, status_boarding')
        .eq('jadwal_id', jadwalId)
        .eq('status', 'paid')

      if (errP) {
        setError('Gagal ambil data penumpang: ' + errP.message)
        setLoading(false)
        return
      }

      const list: Penumpang[] = []
      for (const p of pesananData || []) {
        const { data: k } = await supabase.from('kursi').select('nomor_kursi').eq('id', p.kursi_id).single()
        list.push({
          id: p.id,
          nama: p.nama_penumpang,
          nik: p.nik,
          nomor_hp: p.nomor_hp || '-',
          kursi: k?.nomor_kursi || '-',
          kanal: p.kanal,
          kode_tiket: p.kode_tiket,
          status_boarding: p.status_boarding || 'belum',
        })
      }

      list.sort((a, b) => parseInt(a.kursi) - parseInt(b.kursi))
      setPenumpangList(list)
      setLoading(false)
    }

    loadData()
  }, [jadwalId, router])

  function handleKembali() {
    const sesi = getOperatorSession()
    if (sesi) {
      router.push('/dashboard/loket-menu')
    } else {
      router.push('/dashboard')
    }
  }

  function getWarnaKanal(kanal: string) {
    if (kanal === 'online') return 'bg-green-100 text-green-800 border-green-300'
    if (kanal === 'loket') return 'bg-blue-100 text-blue-800 border-blue-300'
    if (kanal === 'mobile') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    if (kanal === 'keberangkatan') return 'bg-orange-100 text-orange-800 border-orange-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat daftar penumpang...</p>
  if (error) return <p className="p-6 text-center text-red-600">Error: {error}</p>
  if (!detailJadwal) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daftar Penumpang</h1>
            <p className="text-sm text-gray-700 font-medium mt-1">
              {detailJadwal.rute_asal} → {detailJadwal.rute_tujuan} • {detailJadwal.nama_kapal}
            </p>
            <p className="text-sm text-gray-600">
              {detailJadwal.tanggal} • Jam {detailJadwal.jam_berangkat}
            </p>
          </div>
          <button onClick={handleKembali} className="text-sm bg-white px-4 py-2 rounded shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium">
            ← Kembali
          </button>
        </div>

        {/* KETERANGAN WARNA */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <span className="px-2 py-1 rounded border bg-green-100 text-green-800 border-green-300 font-medium">🟢 Online</span>
          <span className="px-2 py-1 rounded border bg-blue-100 text-blue-800 border-blue-300 font-medium">🔵 Loket</span>
          <span className="px-2 py-1 rounded border bg-yellow-100 text-yellow-800 border-yellow-300 font-medium">🟡 Mobile</span>
          <span className="px-2 py-1 rounded border bg-orange-100 text-orange-800 border-orange-300 font-medium">🟠 Keberangkatan</span>
        </div>

        {/* TABEL PENUMPANG */}
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 w-12">No</th>
                <th className="text-left px-4 py-3">Kursi</th>
                <th className="text-left px-4 py-3">Nama Penumpang</th>
                <th className="text-left px-4 py-3">No. HP</th>
                <th className="text-left px-4 py-3">NIK</th>
                <th className="text-left px-4 py-3">Kanal</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {penumpangList.map((p, idx) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 font-bold">{idx + 1}</td>
                  <td className="px-4 py-3 font-bold text-lg text-blue-700">{p.kursi}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{p.nama}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{p.nomor_hp}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.nik}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded border text-xs font-bold uppercase ${getWarnaKanal(p.kanal)}`}>
                      {p.kanal || 'loket'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {detailJadwal.status_jadwal === 'berangkat' ? (
                      <span className="text-gray-500 font-bold text-xs bg-gray-100 px-2 py-1 rounded">CLOSED</span>
                    ) : p.status_boarding === 'sudah' ? (
                      <span className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">✓ BOARDED</span>
                    ) : (
                      <span className="text-blue-600 font-bold text-xs bg-blue-50 px-2 py-1 rounded">OPEN</span>
                    )}
                  </td>
                </tr>
              ))}
              {penumpangList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 font-medium">
                    Belum ada penumpang yang membeli tiket untuk jadwal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

export default function DaftarPenumpangPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <DaftarPenumpangContent />
    </Suspense>
  )
}