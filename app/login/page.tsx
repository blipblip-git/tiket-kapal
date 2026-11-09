'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type RincianPenumpang = {
  id: string; nama: string; kursi: string; kanal: string; kode_tiket: string; waktu_boarding: string | null
}

type LaporanPerJam = {
  jam: string; total_terjual: number; rincian: RincianPenumpang[]; nama_kapal: string; nama_kapten: string
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'operator' | 'syahbandar') || 'operator'

  const [tab, setTab] = useState<'operator' | 'syahbandar'>(initialTab)
  const [noHp, setNoHp] = useState('')
  const [password, setPassword] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // State khusus Syahbandar
  const [sbLoading, setSbLoading] = useState(false)
  const [sbLaporan, setSbLaporan] = useState<LaporanPerJam[]>([])
  const [sbTanggal, setSbTanggal] = useState(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60000
    return new Date(today.getTime() - offset).toISOString().split('T')[0]
  })
  const [sbLokasi, setSbLokasi] = useState('Tarakan')
  const [sbExpandedJam, setSbExpandedJam] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('Memeriksa data...')

    const inputLogin = noHp.trim()
    let emailCek = inputLogin;
    
    if (!inputLogin.includes('@')) {
      const bersihHp = inputLogin.replace(/\D/g, '')
      emailCek = `${bersihHp}@petugas.local`
    } 

    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('email', emailCek).single()
      
      if (error || !data) { 
        setPesan('Akun tidak terdaftar.'); 
        setLoading(false); 
        return 
      }
      
      if (!data.aktif) { 
        setPesan('Akun dinonaktifkan.'); 
        setLoading(false); 
        return 
      }
      
      if (data.password_plain !== password) { 
        setPesan('Password salah.'); 
        setLoading(false); 
        return 
      }

      // LOGIKA SESI TUNGGAL (BERLAKU UNTUK SEMUA ROLE)
      if (data.sesi_aktif) {
        const lastUpdate = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const now = new Date().getTime();
        const diffSeconds = (now - lastUpdate) / 1000;

        if (diffSeconds < 30) {
          setPesan('Akun ini sedang aktif di perangkat lain. Silakan tunggu 30 detik lalu coba lagi.');
          setLoading(false);
          return;
        }
      }
      
      // Kunci sesi baru
      await supabase.from('profiles').update({ sesi_aktif: true, updated_at: new Date().toISOString() }).eq('id', data.id);

      // Simpan Sesi
      localStorage.setItem('petugas_session', JSON.stringify({
        id: data.id, nama: data.nama, role: data.role, lokasi: data.lokasi, unit: data.unit, email: data.email
      }))

      setPesan('Login berhasil, mengalihkan...');
      setTimeout(() => {
        if (data.role === 'admin_utama') {
          window.location.href = '/dashboard'; 
        } else if (data.role === 'terminal_keberangkatan') {
          window.location.href = '/dashboard/keberangkatan';
        } else if (data.role === 'agen') {
          window.location.href = '/dashboard/agen';
        } else {
          window.location.href = '/pilih-mode';
        }
      }, 500);
      
    } catch (err: any) {
      setPesan('Error: ' + err.message);
      setLoading(false)
    }
  }

  // LOGIKA SYAHBANDAR
  useEffect(() => {
    if (tab !== 'syahbandar') return
    async function fetchData() {
      setSbLoading(true)
      const { data: templateData } = await supabase.from('template_jadwal').select('jam_berangkat').eq('rute_asal', sbLokasi)
      const { data: jadwalData } = await supabase.from('jadwal').select('id, jam_berangkat, kapal_id').eq('tanggal', sbTanggal).eq('rute_asal', sbLokasi)
      const kapalIdsFromJadwal = [...new Set(jadwalData?.map((j: any) => j.kapal_id).filter(Boolean) || [])]
      
      let kapalMap = new Map()
      if (kapalIdsFromJadwal.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('id, nama, nama_kapten').in('id', kapalIdsFromJadwal)
        kapalData?.forEach((k: any) => kapalMap.set(k.id, k))
      }

      const { data: pesananData } = await supabase.from('pesanan').select(`
          id, nama_penumpang, kode_tiket, kanal, waktu_boarding,
          jadwal:jadwal_id (jam_berangkat, rute_asal, kapal_id),
          kursi:kursi_id (nomor_kursi)
        `).eq('status', 'paid').eq('jadwal.tanggal', sbTanggal).eq('jadwal.rute_asal', sbLokasi)

      const filtered = (pesananData || []).filter((item: any) => item.jadwal !== null)
      
      const jamSet = new Set<string>()
      if (templateData) templateData.forEach((t: any) => jamSet.add(t.jam_berangkat.substring(0, 5)))

      const groupedByJam: { [key: string]: LaporanPerJam } = {}
      jamSet.forEach(jam => {
        const jadwalCocok = jadwalData?.find((j: any) => j.jam_berangkat.substring(0, 5) === jam)
        const dataKapal = jadwalCocok ? kapalMap.get(jadwalCocok.kapal_id) : null
        groupedByJam[jam] = { jam, total_terjual: 0, rincian: [], nama_kapal: dataKapal?.nama || '-', nama_kapten: dataKapal?.nama_kapten || '-' }
      })

      filtered.forEach((item: any) => {
        const jam = item.jadwal.jam_berangkat.substring(0, 5)
        if (!groupedByJam[jam]) groupedByJam[jam] = { jam, total_terjual: 0, rincian: [], nama_kapal: '-', nama_kapten: '-' }
        const group = groupedByJam[jam]
        group.total_terjual += 1
        group.rincian.push({ 
          id: item.id, 
          nama: item.nama_penumpang, 
          kursi: item.kursi?.nomor_kursi || '-', 
          kanal: item.kanal || 'loket', 
          kode_tiket: item.kode_tiket,
          waktu_boarding: item.waktu_boarding || null
        })
      })

      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const isHariIni = sbTanggal === todayStr
      const jamSekarang = now.getHours() * 60 + now.getMinutes()

      const semuaLaporan = Object.values(groupedByJam).sort((a, b) => a.jam.localeCompare(b.jam))
      
      const laporanSiap = semuaLaporan.filter(l => {
        if (!isHariIni) return true
        const [jamL, menitL] = l.jam.split(':').map(Number)
        const totalMenitLaporan = (jamL * 60) + menitL
        const selisih = totalMenitLaporan - jamSekarang
        return selisih <= 120
      })

      setSbLaporan(laporanSiap)
      setSbLoading(false)
    }
    fetchData()
  }, [tab, sbTanggal, sbLokasi])

  const handlePrintSyahbandar = () => { setTimeout(() => window.print(), 100) }
  
  const urutkanBerdasarkanScan = (rincian: RincianPenumpang[]) => {
    return [...rincian].sort((a, b) => {
      if (!a.waktu_boarding && !b.waktu_boarding) return 0;
      if (!a.waktu_boarding) return 1;
      if (!b.waktu_boarding) return -1;
      return new Date(a.waktu_boarding).getTime() - new Date(b.waktu_boarding).getTime();
    });
  }

  const sbRincianAktif = sbExpandedJam ? sbLaporan.find(l => l.jam === sbExpandedJam) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; margin: 15mm; }
          .print-hidden { display: none !important; }
          .print-show { display: block !important; }
        }
      `}} />

      <div className={`w-full ${tab === 'syahbandar' ? 'max-w-5xl' : 'max-w-sm'} transition-all duration-300`}>
        
        <div className="bg-white rounded shadow-md overflow-hidden print:shadow-none">
          <div className="flex border-b print-hidden">
            <button onClick={() => { setTab('operator'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'operator' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>Login Petugas / Agen</button>
            <button onClick={() => { setTab('syahbandar'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'syahbandar' ? 'bg-blue-800 text-white border-b-2 border-blue-900' : 'text-gray-500 hover:bg-gray-50'}`}>Portal Syahbandar</button>
          </div>

          {tab === 'operator' && (
            <form onSubmit={handleLogin} className="p-6" autoComplete="off">
              <label className="block mb-2 text-sm font-medium text-gray-900">Nomor HP / Email</label>
              <input type="text" name="operator_hp_no_autofill" value={noHp} onChange={(e) => setNoHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="off" />

              <label className="block mb-2 text-sm font-medium text-gray-900">Password</label>
              <div className="relative mb-6">
                <input type={showPassword ? 'text' : 'password'} name="admin_pass_no_autofill" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 pr-10 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium">
                {loading ? 'Memproses...' : 'Login'}
              </button>

              {pesan && (
                <p className={`mt-4 text-sm text-center break-words font-medium ${pesan.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>{pesan}</p>
              )}
            </form>
          )}

          {/* KONTEN SYAHBANDAR */}
          {tab === 'syahbandar' && (
            <div className="p-3 md:p-6 bg-gray-50 min-h-[500px]">
              <div className="flex justify-between items-center mb-4 md:mb-6 bg-blue-800 text-white p-4 rounded print-hidden">
                <div>
                  <h1 className="text-lg md:text-xl font-bold">PORTAL SYAHBANDAR</h1>
                  <p className="text-xs md:text-sm text-blue-200">Sistem Manifest Penumpang Kapal</p>
                </div>
              </div>

              <div className="bg-white p-3 md:p-4 rounded shadow mb-4 md:mb-6 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 print-hidden">
                <div className="w-full md:w-auto">
                  <label className="block text-[10px] md:text-xs font-medium text-gray-700 mb-1">Pilih Rute (Asal)</label>
                  <select value={sbLokasi} onChange={(e) => setSbLokasi(e.target.value)} className="w-full md:w-auto border rounded px-3 py-2 text-xs md:text-sm text-gray-900">
                    <option value="Tarakan">Tarakan</option>
                    <option value="Tanjung Selor">Tanjung Selor</option>
                  </select>
                </div>
                <div className="w-full md:w-auto">
                  <label className="block text-[10px] md:text-xs font-medium text-gray-700 mb-1">Pilih Tanggal</label>
                  <input type="date" value={sbTanggal} onChange={(e) => setSbTanggal(e.target.value)} className="w-full md:w-auto border rounded px-3 py-2 text-xs md:text-sm text-gray-900" />
                </div>
              </div>

              <div className="space-y-2 md:space-y-3">
                {sbLoading ? (
                  <p className="text-center text-gray-500 text-sm">Memuat data...</p>
                ) : sbLaporan.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 text-sm">Belum ada jadwal manifest yang siap ditampilkan.</p>
                ) : (
                  sbLaporan.map((l) => (
                    <div key={l.jam} className="bg-white rounded shadow border border-gray-200 overflow-hidden print-hidden">
                      <button onClick={() => setSbExpandedJam(sbExpandedJam === l.jam ? null : l.jam)} className="w-full p-3 md:px-4 md:py-3 flex flex-col md:flex-row md:justify-between md:items-center hover:bg-gray-50 transition text-left gap-2 md:gap-0">
                        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                          <span className="font-bold text-xs md:text-sm text-gray-900">Manifest Jam {l.jam}</span>
                          <span className="text-[10px] md:text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{l.nama_kapal}</span>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-1 md:mt-0">
                          <span className="text-[10px] md:text-sm font-bold text-blue-600">{l.total_terjual} Penumpang</span>
                          <span className="text-[10px] md:text-xs text-blue-600">{sbExpandedJam === l.jam ? '▲' : '▼'}</span>
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {sbExpandedJam && sbRincianAktif && (
                <div className="mt-4 md:mt-8 print-hidden">
                  <div className="bg-white rounded shadow border-2 border-blue-400 overflow-hidden">
                    <div className="bg-blue-600 text-white p-3 md:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0">
                      <div><h3 className="font-bold text-sm md:text-lg">Rincian Manifest Jam {sbExpandedJam}</h3></div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={handlePrintSyahbandar} className="flex-1 md:flex-none bg-green-600 text-white px-3 py-1.5 rounded text-[10px] md:text-sm font-bold hover:bg-green-700">🖨️ Cetak</button>
                        <button onClick={() => setSbExpandedJam(null)} className="flex-1 md:flex-none bg-red-600 text-white px-3 py-1.5 rounded text-[10px] md:text-sm font-bold hover:bg-red-700">Tutup</button>
                      </div>
                    </div>
                    
                    <div className="p-3 md:p-4 bg-gray-50 border-b text-[10px] md:text-sm grid grid-cols-[70px_10px_1fr] md:grid-cols-[150px_10px_1fr] gap-y-1 text-gray-800">
                      <span>Tanggal</span><span>:</span><span>{sbTanggal}</span>
                      <span>Rute</span><span>:</span><span>{sbLokasi} - {sbLokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
                      <span>Kapal</span><span>:</span><span className="font-medium">{sbRincianAktif.nama_kapal}</span>
                      <span>Kapten</span><span>:</span><span className="font-bold">{sbRincianAktif.nama_kapten}</span>
                      <span>Penumpang</span><span>:</span><span className="font-bold text-blue-700">{sbRincianAktif.total_terjual} Orang</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-2 md:px-4 py-2 text-center text-[10px] md:text-xs font-bold text-gray-700 w-8">No</th>
                            <th className="px-2 md:px-4 py-2 text-left text-[10px] md:text-xs font-bold text-gray-700">Nama / Kursi</th>
                            <th className="px-2 md:px-4 py-2 text-center text-[10px] md:text-xs font-bold text-gray-700 w-16">Scan</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {sbRincianAktif.rincian.length === 0 ? (
                            <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 italic text-xs">Belum ada penumpang.</td></tr>
                          ) : (
                            urutkanBerdasarkanScan(sbRincianAktif.rincian).map((p, idx) => (
                              <tr key={p.id} className="hover:bg-gray-50">
                                <td className="px-2 md:px-4 py-2 text-center text-[10px] md:text-sm text-gray-500">{idx + 1}</td>
                                <td className="px-2 md:px-4 py-2 text-[10px] md:text-sm font-bold text-gray-900 break-words">{p.nama} / {p.kursi}</td>
                                <td className="px-2 md:px-4 py-2 text-center text-[10px] md:text-sm text-gray-600">
                                  {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAMPILAN PRINT: MANIFEST */}
              {sbExpandedJam && sbRincianAktif && (
                <div className="hidden print:block mt-8">
                  <h1 className="text-xl font-bold text-center mb-6">LAPORAN MANIFEST PENUMPANG JAM {sbRincianAktif.jam}</h1>
                  
                  <div className="mb-4 text-sm grid grid-cols-[150px_10px_1fr] gap-y-1">
                    <span>Tanggal</span><span>:</span><span>{sbTanggal}</span>
                    <span>Rute</span><span>:</span><span>{sbLokasi} - {sbLokasi === 'Tarakan' ? 'Tanjung Selor' : 'Tarakan'}</span>
                    <span>Kapal</span><span>:</span><span>{sbRincianAktif.nama_kapal}</span>
                    <span>Kapten</span><span>:</span><span>{sbRincianAktif.nama_kapten}</span>
                    <span className="whitespace-nowrap">Total Penumpang</span><span>:</span><span className="font-bold">{sbRincianAktif.total_terjual} Orang</span>
                  </div>
                  
                  <table className="w-full text-sm border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 px-2 py-1 w-8">NO</th>
                        <th className="border border-gray-400 px-2 py-1">NAMA / KURSI</th>
                        <th className="border border-gray-400 px-2 py-1">SCAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {urutkanBerdasarkanScan(sbRincianAktif.rincian).map((p, idx) => (
                        <tr key={p.id}>
                          <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                          <td className="border border-gray-400 px-2 py-1 font-bold">{p.nama} / {p.kursi}</td>
                          <td className="border border-gray-400 px-2 py-1 text-center">
                            {p.waktu_boarding ? new Date(p.waktu_boarding).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-gray-100">
                        <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">TOTAL PENUMPANG</td>
                        <td className="border border-gray-400 px-2 py-1 text-center">{sbRincianAktif.total_terjual}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <LoginContent />
    </Suspense>
  )
}