'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile } from '@/lib/supabase'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
// TAMBAHAN BARU: Import fungsi printer
import { cetakTiketThermal } from '@/lib/thermalPrinter'

type HasilPencarian = {
  id: string
  nama_penumpang: string
  kode_tiket: string
  nik: string
  kanal: string
  kursi: string
  jadwal: string
  kapal: string
  tanggal: string
  jam: string
  harga: number
}

function CetakUlangContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [hasil, setHasil] = useState<HasilPencarian[]>([])
  const [sedangCari, setSedangCari] = useState(false)
  const [pesan, setPesan] = useState('')
  
  const [detailPilih, setDetailPilih] = useState<HasilPencarian | null>(null)
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    async function init() {
      const sesi = getOperatorSession()
      if (!sesi) {
        const admin = await getProfile()
        if (!admin || admin.role !== 'admin_utama') {
          router.push('/login')
          return
        }
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function handleCari(e: React.FormEvent) {
    e.preventDefault()
    if (!keyword) return
    setSedangCari(true)
    setPesan('')
    setHasil([])
    setDetailPilih(null)

    const { data, error } = await supabase
      .from('pesanan')
      .select(`
        id, nama_penumpang, kode_tiket, nik, kanal,
        jadwal:jadwal_id (rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal:kapal_id(nama)),
        kursi:kursi_id (nomor_kursi)
      `)
      .or(`nama_penumpang.ilike.%${keyword}%,kode_tiket.eq.${keyword}`)
      .eq('status', 'paid')

    if (error) {
      setPesan('Gagal mencari: ' + error.message)
      setSedangCari(false)
      return
    }

    if (data && data.length > 0) {
      const mapped = data.map((item: any) => ({
        id: item.id,
        nama_penumpang: item.nama_penumpang,
        kode_tiket: item.kode_tiket,
        nik: item.nik,
        kanal: item.kanal,
        kursi: item.kursi?.nomor_kursi || '-',
        jadwal: `${item.jadwal?.rute_asal} - ${item.jadwal?.rute_tujuan}`,
        kapal: item.jadwal?.kapal?.nama || '-',
        tanggal: item.jadwal?.tanggal || '-',
        jam: item.jadwal?.jam_berangkat || '-',
        harga: item.jadwal?.harga || 0,
      }))
      setHasil(mapped)
    } else {
      setPesan('Tiket tidak ditemukan.')
    }
    setSedangCari(false)
  }

  async function handlePilih(tiket: HasilPencarian) {
    setDetailPilih(tiket)
    setQrUrl('') // Reset QR dulu
    const qr = await QRCode.toDataURL(tiket.kode_tiket, { width: 300, margin: 2 })
    setQrUrl(qr)
  }

  async function handleSimpan() {
    if (!detailPilih) return
    setPesan('Menyiapkan gambar...')
    
    const el = document.getElementById('area-tiket-ulang')
    if (el) {
      try {
        const dataUrl = await toPng(el, { quality: 0.85, pixelRatio: 1.5, backgroundColor: '#ffffff' })
        const link = document.createElement('a')
        link.download = `${detailPilih.nama_penumpang.split(' ')[0]}.png`
        link.href = dataUrl
        link.click()
        setPesan('Berhasil diunduh.')
      } catch (err) {
        setPesan('Gagal mengunduh gambar.')
      }
    }
  }

  // REVISI: Fungsi ini sekarang manggil Web Serial dari file helper
  async function handlePrintThermal() {
    if (!detailPilih) return
    setPesan('Memproses printer...')
    
    const result = await cetakTiketThermal(detailPilih)
    setPesan(result.message)
  }

  function handleKembali() {
    const sesi = getOperatorSession()
    if (sesi) {
      if (sesi.role === 'terminal_keberangkatan') router.push('/dashboard/keberangkatan')
      else if (sesi.role === 'agen') router.push('/dashboard/agen')
      else router.push('/dashboard/loket-menu')
    } else {
      router.push('/dashboard')
    }
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>

  // Cek apakah user ini Agen atau Operator Keberangkatan
  const sesi = getOperatorSession()
  const isAgenAtauKeberangkatan = sesi?.role === 'agen' || sesi?.role === 'terminal_keberangkatan'

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: 80mm auto; margin: 0; } /* Ukuran kertas thermal */
          body * { visibility: hidden; }
          #area-tiket-ulang, #area-tiket-ulang * { visibility: visible; }
          #area-tiket-ulang { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; }
          .print-hidden { display: none !important; }
        }
      `}} />

      <div className="max-w-4xl mx-auto print:max-w-none print:w-full">
        
        <div className="flex justify-between items-center mb-6 print-hidden">
          <h1 className="text-2xl font-bold text-gray-900">Cetak Ulang Tiket</h1>
          <button onClick={handleKembali} className="text-sm bg-white px-4 py-2 rounded shadow-sm border border-gray-200 text-gray-700 font-medium">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        <div className="bg-white p-6 rounded shadow mb-6 print-hidden">
          <form onSubmit={handleCari} className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Cari berdasarkan Nama atau Kode Tiket..."
              className="flex-1 border rounded px-4 py-2 text-gray-900"
            />
            <button type="submit" disabled={sedangCari} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400">
              {sedangCari ? 'Mencari...' : 'Cari Tiket'}
            </button>
          </form>
          {pesan && <p className="text-sm mt-3 text-blue-600 font-medium">{pesan}</p>}
        </div>

        {hasil.length > 0 && !detailPilih && (
          <div className="bg-white rounded shadow overflow-hidden print-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nama</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Kode</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Rute</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((h) => (
                  <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">{h.nama_penumpang}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{h.kode_tiket}</td>
                    <td className="px-4 py-3 text-gray-700">{h.jadwal}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handlePilih(h)} className="text-blue-600 font-medium hover:underline">
                        Lihat & Cetak
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailPilih && (
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md flex justify-between mb-4 print-hidden">
              <button onClick={() => setDetailPilih(null)} className="text-sm text-gray-600 hover:underline">
                &larr; Kembali ke Hasil Pencarian
              </button>
              
              {/* LOGIKA: Jika Agen atau Operator Keberangkatan, SELALU Cetak Thermal. Jika Admin/Bukan, cek kanal */}
              {isAgenAtauKeberangkatan ? (
                <button onClick={handlePrintThermal} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-blue-700 shadow-sm flex items-center gap-2">
                  🖨️ Cetak Thermal
                </button>
              ) : (
                detailPilih.kanal === 'online' ? (
                  <button onClick={handleSimpan} className="bg-green-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-green-700 shadow-sm">
                    📥 Simpan Tiket
                  </button>
                ) : (
                  <button onClick={handlePrintThermal} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-blue-700 shadow-sm flex items-center gap-2">
                    🖨️ Cetak Thermal
                  </button>
                )
              )}
            </div>

            <div id="area-tiket-ulang" className="bg-white rounded shadow-md p-6 text-gray-900 w-full max-w-md print:shadow-none print:p-0">
              <div className="text-center mb-4">
                <p className="text-xs text-gray-600 uppercase">Kode Tiket</p>
                <p className="font-bold text-sm">{detailPilih.kode_tiket}</p>
              </div>
              
              <div className="flex justify-center mb-4">
                {qrUrl ? (
                  <img src={qrUrl} alt="QR" className="w-40 h-40" />
                ) : (
                  <div className="w-40 h-40 bg-gray-100 animate-pulse rounded-md flex items-center justify-center text-xs text-gray-400">
                    Memuat QR...
                  </div>
                )}
              </div>

              <hr className="my-4 border-dashed border-gray-300" />
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Nama</span>
                  <span className="font-bold text-gray-900">{detailPilih.nama_penumpang}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">NIK</span>
                  <span className="font-medium text-gray-900">{detailPilih.nik}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kapal</span>
                  <span className="font-medium text-gray-900">{detailPilih.kapal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Rute</span>
                  <span className="font-medium text-gray-900">{detailPilih.jadwal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tanggal</span>
                  <span className="font-medium text-gray-900">{detailPilih.tanggal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jam</span>
                  <span className="font-medium text-gray-900">{detailPilih.jam}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-50 p-2 rounded -mx-2">
                  <span className="text-blue-800 font-medium">Kursi</span>
                  <span className="font-bold text-blue-700 text-xl">{detailPilih.kursi}</span>
                </div>
              </div>
              <hr className="my-4 border-dashed border-gray-300" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">Total Bayar</span>
                <span className="font-bold text-gray-900 text-lg">Rp {detailPilih.harga.toLocaleString('id-ID')}</span>
              </div>
              <div className="mt-4 text-center text-xs text-gray-400 border-t pt-2">
                Tunjukkan e-tiket ini ke petugas saat boarding.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function CetakUlangPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <CetakUlangContent />
    </Suspense>
  )
}