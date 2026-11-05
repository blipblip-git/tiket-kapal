'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, logout, type Profile, type AuditLog } from '@/lib/supabase'

type DetailPenumpang = {
  nama: string
  kode_tiket: string
  kursi_id: string
  jumlah: number
}

type DetailKonfirmasiCash = {
  grup_transaksi_id?: string
  jumlah_tiket?: number
  total_bayar?: number
  rute?: string
  jam_berangkat?: string
  nomor_hp?: string
  daftar_penumpang?: DetailPenumpang[]
  // fallback format lama (per tiket)
  nama_penumpang?: string
  kode_tiket?: string
  jumlah?: number
}

export default function AuditPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [filterAksi, setFilterAksi] = useState<string>('semua')
  const [filterPetugas, setFilterPetugas] = useState<string>('semua')
  const [filterTanggal, setFilterTanggal] = useState<string>('')

  useEffect(() => {
    async function loadData() {
      const p = await getProfile()
      if (!p) {
        router.push('/login')
        return
      }
      if (p.role !== 'admin_utama') {
        setError('Hanya Admin Utama yang bisa akses halaman audit.')
        setLoading(false)
        return
      }
      setProfile(p)
      await loadLogs()
      setLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function loadLogs() {
    const { data, error: errL } = await supabase
      .from('audit_log')
      .select('*')
      .order('waktu', { ascending: false })
      .limit(500)

    if (errL) {
      setError('Gagal ambil audit log: ' + errL.message)
      return
    }
    setLogs((data || []) as AuditLog[])
  }

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  // ==================== FORMAT ====================
  function formatWaktu(iso: string) {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  function formatJam(iso: string) {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function labelAksi(aksi: string) {
    const map: Record<string, string> = {
      konfirmasi_cash: '💵 Konfirmasi Cash',
      close_jadwal: '🔒 Close Jadwal',
      print_tiket: '🖨️ Print Tiket',
      tutup_shift: '🚪 Tutup Shift',
      tukar_jadwal: '🔄 Tukar Jadwal',
    }
    return map[aksi] || aksi
  }

  // ==================== RENDER DETAIL ====================
  function renderDetail(log: AuditLog) {
    if (!log.detail) return <span className="text-gray-400">-</span>

    // Khusus konfirmasi_cash
    if (log.aksi === 'konfirmasi_cash') {
      const d = log.detail as DetailKonfirmasiCash

      // Format baru: per grup
      if (d.daftar_penumpang && d.daftar_penumpang.length > 0) {
        const total = d.total_bayar || 0
        const jumlahTiket = d.jumlah_tiket || d.daftar_penumpang.length

        return (
          <div className="space-y-3">
            {/* Header grup */}
            <div className="text-xs text-gray-600">
              <b>{d.rute}</b> • Jam {d.jam_berangkat?.slice(0, 5) || '-'}
              {d.nomor_hp && <> • HP: {d.nomor_hp}</>}
            </div>

            {/* Daftar penumpang */}
            <div className="space-y-3">
              {d.daftar_penumpang.map((p, idx) => (
                <div key={idx} className="text-xs leading-relaxed">
                  <div className="text-gray-800">
                    <span className="text-gray-500">Nama / Kode Tiket / Jam :</span>{' '}
                    <b>{p.nama}</b> / <span className="font-mono">{p.kode_tiket}</span> / {d.jam_berangkat?.slice(0, 5)}
                  </div>
                  <div className="text-gray-800">
                    <span className="text-gray-500">Rute / Jumlah :</span>{' '}
                    {d.rute} / <b className="text-blue-600">Rp {p.jumlah.toLocaleString('id-ID')}</b>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="pt-2 border-t border-gray-200 text-sm">
              <span className="text-gray-700">Total Transaksi: </span>
              <b className="text-blue-600 text-base">
                Rp {total.toLocaleString('id-ID')}
              </b>
              <span className="text-xs text-gray-500"> ({jumlahTiket} tiket)</span>
            </div>
          </div>
        )
      }

      // Fallback format lama (per tiket)
      return (
        <div className="text-xs leading-relaxed space-y-1">
          <div className="text-gray-800">
            <span className="text-gray-500">Nama / Kode Tiket / Jam :</span>{' '}
            <b>{d.nama_penumpang}</b> / <span className="font-mono">{d.kode_tiket}</span> / {d.jam_berangkat?.slice(0, 5)}
          </div>
          <div className="text-gray-800">
            <span className="text-gray-500">Rute / Jumlah :</span>{' '}
            {d.rute} / <b className="text-blue-600">Rp {(d.jumlah || 0).toLocaleString('id-ID')}</b>
          </div>
        </div>
      )
    }

    // Aksi lain (close_jadwal dll) → tampil JSON mentah seperti sebelumnya
    return (
      <pre className="whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded text-xs text-gray-700 max-w-md">
        {JSON.stringify(log.detail, null, 2)}
      </pre>
    )
  }

  // ==================== DAFTAR UNIK ====================
  const daftarAksi = Array.from(new Set(logs.map((l) => l.aksi)))
  const daftarPetugas = Array.from(new Set(logs.map((l) => l.petugas_email)))

  // ==================== FILTER ====================
  const filtered = logs.filter((l) => {
    if (filterAksi !== 'semua' && l.aksi !== filterAksi) return false
    if (filterPetugas !== 'semua' && l.petugas_email !== filterPetugas) return false
    if (filterTanggal) {
      const tgl = l.waktu.split('T')[0]
      if (tgl !== filterTanggal) return false
    }
    return true
  })

  // ==================== HITUNG TOTAL KESELURUHAN ====================
  const totalKeseluruhan = filtered.reduce((sum, l) => {
    if (l.aksi === 'konfirmasi_cash' && l.detail) {
      const d = l.detail as DetailKonfirmasiCash
      if (d.total_bayar) return sum + d.total_bayar
      if (d.jumlah) return sum + d.jumlah
    }
    return sum
  }, 0)

  if (loading) return <p className="p-6 text-gray-900">Memuat audit log...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-sm text-gray-700">
              Semua aksi finansial yang dilakukan petugas
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
          >
            Logout
          </button>
        </div>

        {/* FILTER */}
        <div className="bg-white p-4 rounded shadow mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">Aksi</label>
            <select
              value={filterAksi}
              onChange={(e) => setFilterAksi(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm text-gray-900"
            >
              <option value="semua">Semua</option>
              {daftarAksi.map((a) => (
                <option key={a} value={a}>{labelAksi(a)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">Petugas</label>
            <select
              value={filterPetugas}
              onChange={(e) => setFilterPetugas(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm text-gray-900"
            >
              <option value="semua">Semua</option>
              {daftarPetugas.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">Tanggal</label>
            <input
              type="date"
              value={filterTanggal}
              onChange={(e) => setFilterTanggal(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm text-gray-900"
            />
          </div>
        </div>

        {/* INFO JUMLAH + TOTAL */}
        <div className="bg-white p-4 rounded shadow mb-4 flex flex-wrap justify-between items-center gap-2">
          <p className="text-sm text-gray-700">
            Menampilkan <b>{filtered.length}</b> dari <b>{logs.length}</b> entri
            {(filterAksi !== 'semua' || filterPetugas !== 'semua' || filterTanggal) && (
              <button
                onClick={() => { setFilterAksi('semua'); setFilterPetugas('semua'); setFilterTanggal('') }}
                className="ml-3 text-blue-600 hover:underline text-xs"
              >
                Reset filter
              </button>
            )}
          </p>
          {totalKeseluruhan > 0 && (
            <p className="text-sm text-gray-900">
              Total Pendapatan (cash):{' '}
              <b className="text-blue-600 text-base">
                Rp {totalKeseluruhan.toLocaleString('id-ID')}
              </b>
            </p>
          )}
        </div>

        {/* DAFTAR LOG (KARTU, BUKAN TABEL) */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded shadow p-8 text-center text-gray-400 text-sm">
              Belum ada audit log.
            </div>
          )}

          {filtered.map((log) => (
            <div key={log.id} className="bg-white rounded shadow p-4">
              <div className="flex flex-wrap justify-between items-start gap-2 mb-3 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-gray-900">
                    {labelAksi(log.aksi)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatWaktu(log.waktu)}
                  </span>
                </div>
                <span className="text-xs text-gray-600">
                  👤 {log.petugas_email}
                </span>
              </div>

              {renderDetail(log)}
            </div>
          ))}
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