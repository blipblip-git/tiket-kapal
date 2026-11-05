'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession } from '@/lib/supabase'

function JadwalContent() {
  const router = useRouter()
  const [jadwal, setJadwal] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tanggal, setTanggal] = useState('')
  const [role, setRole] = useState<string>('')

  // State untuk Edit Harga
  const [editId, setEditId] = useState<string | null>(null)
  const [editHarga, setEditHarga] = useState<string>('')
  const [simpanLoading, setSimpanLoading] = useState(false)

  useEffect(() => {
    async function init() {
      // Cek Sesi untuk keperluan tombol kembali
      let profile = await getProfile()
      if (!profile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) profile = sesiLokal as any
      }
      
      if (profile) {
        setRole(profile.role)
      }

      const today = new Date()
      const offset = today.getTimezoneOffset() * 60000
      const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0]
      setTanggal(localDate)
      loadData(localDate)
    }
    init()
  }, [])

  const loadData = async (tgl: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jadwal')
      .select(`
        *,
        kapal:kapal_id (nama)
      `)
      .eq('tanggal', tgl)
      .eq('status_jadwal', 'open')
      .order('jam_berangkat', { ascending: true })

    if (!error && data) {
      const now = new Date()
      const hariIniStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const jamSekarang = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

      const filteredData = data.filter((j: any) => {
        if (tgl !== hariIniStr) return true
        const jamBerangkat = j.jam_berangkat.substring(0, 5)
        return jamBerangkat >= jamSekarang
      })

      setJadwal(filteredData)
    }
    setLoading(false)
  }

  const handleTanggalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTanggal(e.target.value)
    loadData(e.target.value)
  }

  const handleKembali = () => {
    if (role === 'admin_utama') {
      router.push('/dashboard')
    } else if (role === 'terminal_keberangkatan') {
      router.push('/dashboard/keberangkatan')
    } else if (role) {
      router.push('/dashboard/loket-menu')
    } else {
      router.push('/login')
    }
  }

  // Fungsi untuk menyimpan harga baru
  const handleSimpanHarga = async (id: string) => {
    const hargaBaru = parseInt(editHarga.replace(/\D/g, ''), 10)
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      alert('Masukkan harga yang valid (angka).')
      return
    }

    setSimpanLoading(true)
    const { error } = await supabase
      .from('jadwal')
      .update({ harga: hargaBaru })
      .eq('id', id)

    if (error) {
      alert('Gagal update harga: ' + error.message)
    } else {
      // Update state lokal agar langsung berubah tanpa reload
      setJadwal(prev => prev.map(j => j.id === id ? { ...j, harga: hargaBaru } : j))
      setEditId(null)
    }
    setSimpanLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Jadwal Keberangkatan</h1>
          </div>
          <button onClick={handleKembali} className="text-sm text-blue-600 hover:underline bg-white px-3 py-2 rounded shadow-sm border border-gray-200">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Tanggal:</label>
          <input 
            type="date" 
            value={tanggal}
            onChange={handleTanggalChange}
            className="border rounded px-3 py-1 text-gray-900"
          />
        </div>

        {loading ? (
          <p className="text-center text-gray-500">Memuat jadwal...</p>
        ) : jadwal.length === 0 ? (
          <p className="text-center text-gray-500 bg-white p-4 rounded shadow">Tidak ada jadwal yang tersedia untuk tanggal ini atau waktu sudah lewat.</p>
        ) : (
          <div className="space-y-3">
            {jadwal.map((j) => (
              <div key={j.id} className="bg-white p-4 rounded shadow border border-gray-200 flex justify-between items-center">
                <div>
                  <p className="font-bold text-lg text-gray-900">{j.rute_asal} &rarr; {j.rute_tujuan}</p>
                  <p className="text-sm text-gray-700">{j.kapal?.nama} • Jam {j.jam_berangkat.substring(0,5)}</p>
                </div>
                
                <div className="text-right">
                  {editId === j.id ? (
                    // Mode Edit Harga
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-700">Rp</span>
                      <input
                        type="number"
                        value={editHarga}
                        onChange={(e) => setEditHarga(e.target.value)}
                        className="border rounded px-2 py-1 w-24 text-gray-900 text-sm focus:ring-blue-500"
                        placeholder="150000"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSimpanHarga(j.id)}
                        disabled={simpanLoading}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-green-700 disabled:bg-gray-400"
                      >
                        {simpanLoading ? '...' : 'Simpan'}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="bg-gray-300 text-gray-800 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    // Mode Tampil Harga
                    <div className="flex items-center gap-2 justify-end">
                      <p className="font-bold text-blue-600">Rp {j.harga?.toLocaleString('id-ID')}</p>
                      
                      {/* Tombol Edit Hanya Muncul untuk Admin */}
                      {role === 'admin_utama' && (
                        <button
                          onClick={() => {
                            setEditId(j.id)
                            setEditHarga(j.harga.toString())
                          }}
                          className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100"
                        >
                          ✏️ Edit Harga
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Status: {j.status_jadwal}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

export default function JadwalPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-600">Memuat...</div>}>
      <JadwalContent />
    </Suspense>
  )
}