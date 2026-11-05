'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { Html5Qrcode } from 'html5-qrcode'

type HasilScan = {
  status: 'valid' | 'sudah_boarding' | 'tidak_valid' | 'terlalu_awal'
  pesanan?: any
  nomor_kursi?: string
  pesan: string
}

function ScanContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [scanning, setScanning] = useState(false)
  const [hasil, setHasil] = useState<HasilScan | null>(null)
  const [error, setError] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scannerAktif, setScannerAktif] = useState(false)

  useEffect(() => {
    async function init() {
      const adminProfile = await getProfile()
      let userProfile = adminProfile
      
      if (!userProfile) {
        const sesiPetugas = getOperatorSession()
        if (sesiPetugas) {
          if (sesiPetugas.role !== 'terminal_keberangkatan' && sesiPetugas.role !== 'admin_utama') {
            router.push('/login')
            return
          }
          userProfile = sesiPetugas
        }
      }

      if (!userProfile) {
        router.push('/login')
        return
      }
      setProfile(userProfile)
      setLoading(false)
    }
    init()

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {})
        } catch (e) {}
      }
    }
  }, [router])

  async function mulaiScan() {
    setError('')
    setHasil(null)
    setScanning(true)

    try {
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await prosesScan(decodedText)
        },
        () => {}
      )
      setScannerAktif(true)
    } catch (err) {
      setError('Gagal buka kamera: ' + (err as Error).message)
      setScanning(false)
    }
  }

  async function stopScan() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (err) {}
    }
    setScannerAktif(false)
    setScanning(false)
  }

  async function prosesScan(kodeTiket: string) {
    if (scannerRef.current) {
      try { await scannerRef.current.pause(true) } catch {}
    }

    const { data: p, error: errP } = await supabase
      .from('pesanan')
      .select('id, nama_penumpang, nik, kode_tiket, status_boarding, jadwal_id, kursi_id')
      .eq('kode_tiket', kodeTiket)
      .maybeSingle()

    if (errP || !p) {
      setHasil({ status: 'tidak_valid', pesan: 'Tiket tidak ditemukan di sistem' })
      return
    }

    const { data: j } = await supabase
      .from('jadwal')
      .select('tanggal, jam_berangkat, rute_asal, rute_tujuan')
      .eq('id', p.jadwal_id)
      .single()

    if (!j) {
      setHasil({ status: 'tidak_valid', pesan: 'Jadwal untuk tiket ini tidak ditemukan' })
      return
    }

    const now = new Date()
    const offset = now.getTimezoneOffset() * 60000
    const hariIniLokal = new Date(now.getTime() - offset).toISOString().split('T')[0]

    if (String(j.tanggal).trim() !== hariIniLokal) {
      setHasil({ 
        status: 'tidak_valid', 
        pesan: `Bukan hari ini. (Jadwal: ${j.tanggal}, Hari ini: ${hariIniLokal})` 
      })
      return
    }

    const [jamJ, menitJ] = j.jam_berangkat.split(':').map(Number)
    const jamBerangkat = new Date()
    jamBerangkat.setHours(jamJ, menitJ, 0, 0)

    const selisihMenit = (jamBerangkat.getTime() - now.getTime()) / 60000

    if (selisihMenit > 30) {
      setHasil({ 
        status: 'terlalu_awal', 
        pesan: `Belum waktunya scan. Scan dibuka 30 menit sebelum berangkat. (Sisa ${Math.ceil(selisihMenit)} menit lagi)` 
      })
      return
    }

    const { data: k } = await supabase.from('kursi').select('nomor_kursi').eq('id', p.kursi_id).single()

    if (p.status_boarding === 'sudah') {
      setHasil({ 
        status: 'sudah_boarding', 
        pesanan: { ...p, jadwal: j }, 
        nomor_kursi: k?.nomor_kursi || '-', 
        pesan: 'Sudah pernah di-scan' 
      })
      return
    }

    await supabase.from('pesanan').update({
      status_boarding: 'sudah',
      waktu_boarding: new Date().toISOString(),
      petugas_boarding: profile?.nama || 'unknown',
    }).eq('id', p.id)

    setHasil({
      status: 'valid',
      pesanan: { ...p, jadwal: j },
      nomor_kursi: k?.nomor_kursi || '-',
      pesan: 'Boarding berhasil',
    })
  }

  // Auto Resume setelah boarding berhasil (jeda 3 detik)
  useEffect(() => {
    if (hasil && hasil.status === 'valid' && scannerRef.current) {
      const timer = setTimeout(() => {
        if (scannerRef.current) {
          try {
            scannerRef.current.resume()
          } catch (err) {
            console.error('Gagal resume kamera:', err)
          }
        }
        // Reset hasil agar tampilan kembali ke kamera
        setHasil(null)
      }, 3000) // 3 detik

      return () => clearTimeout(timer)
    }
  }, [hasil])

  if (loading) return <p className="p-6 text-gray-900">Memuat...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <div className="max-w-md w-full">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scan Boarding</h1>
            <p className="text-sm text-gray-700">Petugas: {profile.nama}</p>
          </div>
          <button onClick={async () => { await stopScan(); router.push('/dashboard/keberangkatan'); }} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow mb-4">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

          {hasil && (
            <div className={`p-4 rounded mb-4 border-2 ${
              hasil.status === 'valid' ? 'bg-green-50 border-green-500' : 
              hasil.status === 'sudah_boarding' ? 'bg-yellow-50 border-yellow-500' : 
              hasil.status === 'terlalu_awal' ? 'bg-orange-50 border-orange-500' :
              'bg-red-50 border-red-500'
            }`}>
              <p className={`font-bold text-lg ${
                hasil.status === 'valid' ? 'text-green-700' : 
                hasil.status === 'sudah_boarding' ? 'text-yellow-700' : 
                hasil.status === 'terlalu_awal' ? 'text-orange-700' :
                'text-red-700'
              }`}>
                {hasil.pesan}
              </p>
              {hasil.pesanan && (
                <div className="text-sm mt-2 space-y-1 text-gray-900">
                  <p>Nama: <b>{hasil.pesanan.nama_penumpang}</b></p>
                  <p>Kursi: <b>{hasil.nomor_kursi}</b></p>
                  <p>Kapal: {hasil.pesanan.jadwal?.rute_asal} &rarr; {hasil.pesanan.jadwal?.rute_tujuan} ({hasil.pesanan.jadwal?.jam_berangkat})</p>
                </div>
              )}
              {hasil.status !== 'valid' && (
                <button onClick={() => { setHasil(null); scannerRef.current?.resume() }} className="mt-3 w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700">
                  Scan Lagi
                </button>
              )}
            </div>
          )}

          <div id="qr-reader" className="w-full rounded overflow-hidden" />
          
          {!scannerAktif && !hasil && (
            <button onClick={mulaiScan} disabled={scanning} className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 font-bold mt-2">
              {scanning ? 'Membuka Kamera...' : '📷 Buka Kamera'}
            </button>
          )}
          {scannerAktif && (
            <button onClick={stopScan} className="w-full mt-2 bg-red-600 text-white py-2 rounded hover:bg-red-700 text-sm font-bold">
              Hentikan Kamera
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900">Memuat...</p>}>
      <ScanContent />
    </Suspense>
  )
}