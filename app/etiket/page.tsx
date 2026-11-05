'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile } from '@/lib/supabase'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

type Pesanan = {
  id: string
  nama_penumpang: string
  nik: string
  nomor_hp: string | null
  kode_tiket: string
  status: string
  jadwal_id: string
  kursi_id: string
  kanal: string
  petugas_jual: string | null
  metode_bayar?: string
  nama_penjual_asli?: string // Tambahan untuk simpan nama asli
}

type Detail = {
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  nama_kapal: string
}

type TiketLengkap = {
  pesanan: Pesanan
  nomor_kursi: string
  qrUrl: string
}

declare global {
  interface Navigator {
    serial: {
      requestPort: (options?: any) => Promise<any>;
    };
  }
}

function EtiketContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pesananParam = searchParams.get('pesanan')

  const [tiketList, setTiketList] = useState<TiketLengkap[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesanShare, setPesanShare] = useState('')
  const [showShareMenu, setShowShareMenu] = useState<string | null>(null)

  const tiketRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

  const pesananIds = pesananParam ? pesananParam.split(',').filter(Boolean) : []

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShareMenu(null)
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.share-container')) {
        setShowShareMenu(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (pesananIds.length === 0) {
        setError('Pesanan tidak ditemukan di URL')
        setLoading(false)
        return
      }

      const { data: p, error: errP } = await supabase
        .from('pesanan')
        .select('*')
        .in('id', pesananIds)

      if (errP || !p || p.length === 0) {
        setError('Pesanan tidak ditemukan')
        setLoading(false)
        return
      }

      const sorted = pesananIds
        .map((id) => p.find((x) => x.id === id))
        .filter((x): x is Pesanan => !!x)

      let detailJadwal: Detail | null = null
      if (sorted[0]) {
        const { data: j } = await supabase
          .from('jadwal')
          .select('rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, kapal_id')
          .eq('id', sorted[0].jadwal_id)
          .single()

        if (j) {
          let namaKapal = '-'
          if (j.kapal_id) {
            const { data: kap } = await supabase
              .from('kapal')
              .select('nama')
              .eq('id', j.kapal_id)
              .single()
            if (kap) namaKapal = kap.nama
          }
          detailJadwal = {
            rute_asal: j.rute_asal,
            rute_tujuan: j.rute_tujuan,
            tanggal: j.tanggal,
            jam_berangkat: j.jam_berangkat,
            harga: j.harga,
            nama_kapal: namaKapal,
          }
          setDetail(detailJadwal)
        }
      }

      const tiketLengkap: TiketLengkap[] = []
      for (const psn of sorted) {
        const { data: k } = await supabase
          .from('kursi')
          .select('nomor_kursi')
          .eq('id', psn.kursi_id)
          .single()

        const { data: pmb } = await supabase
          .from('pembayaran')
          .select('metode')
          .eq('pesanan_id', psn.id)
          .single()

        // Ambil nama asli dari tabel profiles
        let namaPenjual = '-'
        if (psn.kanal === 'online') {
          namaPenjual = 'Online'
        } else if (psn.petugas_jual) {
          const { data: profilPenjual } = await supabase
            .from('profiles')
            .select('nama')
            .eq('email', psn.petugas_jual)
            .single()
          
          if (profilPenjual) {
            namaPenjual = profilPenjual.nama
          } else {
            // Fallback jika email tidak ketemu (misal yang kesimpan no HP)
            namaPenjual = psn.petugas_jual.split('@')[0]
          }
        }

        const qrDataUrl = await QRCode.toDataURL(psn.kode_tiket, {
          width: 200,
          margin: 1,
        })

        tiketLengkap.push({
          pesanan: { 
            ...psn, 
            metode_bayar: pmb?.metode || 'cash_loket',
            nama_penjual_asli: namaPenjual
          },
          nomor_kursi: k?.nomor_kursi || '-',
          qrUrl: qrDataUrl,
        })
      }

      setTiketList(tiketLengkap)
      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generateGambar(pesananId: string): Promise<string | null> {
    const ref = tiketRefs.current[pesananId]
    if (!ref) return null
    try {
      const dataUrl = await toPng(ref, {
        quality: 0.85,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff',
        width: ref.clientWidth,
        height: ref.clientHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        }
      })
      return dataUrl
    } catch (err) {
      console.error('Gagal generate gambar:', err)
      return null
    }
  }

  async function simpanPdfSatu(pesananId: string, namaPenumpang: string) {
    setPesanShare('Menyiapkan PDF...')
    const dataUrl = await generateGambar(pesananId)
    if (!dataUrl) {
      setPesanShare('Gagal membuat PDF')
      return
    }

    const namaDepan = namaPenumpang.split(' ')[0]
    const img = new Image()
    img.src = dataUrl
    img.onload = () => {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [img.width, img.height] })
      pdf.addImage(dataUrl, 'JPEG', 0, 0, img.width, img.height)
      pdf.save(`${namaDepan}.pdf`)
      setPesanShare(`Berhasil mengunduh ${namaDepan}.pdf`)
    }
  }

  async function simpanSemuaPdf() {
    setPesanShare('Memproses semua tiket...')
    for (let i = 0; i < tiketList.length; i++) {
      const t = tiketList[i]
      await simpanPdfSatu(t.pesanan.id, t.pesanan.nama_penumpang)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    setPesanShare('Semua tiket berhasil diproses.')
  }

  async function shareKe(pesananId: string, kodeTiket: string, platform: 'wa' | 'tele' | 'email') {
    setShowShareMenu(null)
    setPesanShare('Menyiapkan gambar...')
    
    const dataUrl = await generateGambar(pesananId)
    if (!dataUrl) {
      setPesanShare('Gagal membuat gambar tiket')
      return
    }

    const teksPesan = `E-Tiket Kapal Anda (Kode: ${kodeTiket}). Perlihatkan gambar ini ke petugas saat boarding.`
    const encodedTeks = encodeURIComponent(teksPesan)

    if (platform === 'wa') {
      window.open(`https://wa.me/?text=${encodedTeks}`, '_blank')
    } else if (platform === 'tele') {
      window.open(`https://t.me/share/url?url=${encodedTeks}`, '_blank')
    } else if (platform === 'email') {
      window.open(`mailto:?subject=E-Tiket Kapal&body=${encodedTeks}`, '_blank')
    }

    const link = document.createElement('a')
    link.download = `tiket-${kodeTiket}.png`
    link.href = dataUrl
    link.click()
    setPesanShare('Gambar sudah di-download, silakan lampirkan ke aplikasi.')
  }

  async function handleCetakThermal(t: TiketLengkap) {
    if (!('serial' in navigator)) {
      alert('Browser Anda tidak mendukung Web Serial. Gunakan Chrome atau Edge terbaru.')
      return
    }

    try {
      setPesanShare('Menyiapkan QR Code...');
      
      const img = new Image();
      img.src = t.qrUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Gagal membuat canvas');
      ctx.drawImage(img, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const widthBytes = Math.ceil(canvas.width / 8);
      const height = canvas.height;
      
      let rasterData = `\x1D\x76\x30\x00${String.fromCharCode(widthBytes % 256, Math.floor(widthBytes / 256), height % 256, Math.floor(height / 256))}`;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < widthBytes; x++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pixelX = x * 8 + bit;
            if (pixelX < canvas.width) {
              const idx = (y * canvas.width + pixelX) * 4;
              const r = imgData.data[idx];
              const g = imgData.data[idx + 1];
              const b = imgData.data[idx + 2];
              const isBlack = (r + g + b) / 3 < 128;
              if (isBlack) {
                byte |= (1 << (7 - bit));
              }
            }
          }
          rasterData += String.fromCharCode(byte);
        }
      }

      setPesanShare('Menghubungkan ke printer...');
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      
      setPesanShare('Mengirim data ke printer...');

      const encoder = new TextEncoder();
      const writer = port.writable.getWriter();

      let textData = '';
      textData += '\x1B\x40'; 
      textData += '\x1B\x33\x05'; 
      textData += '\x1B\x4A\x0A'; 
      textData += '\x1B\x61\x01'; 
      textData += `${t.pesanan.kode_tiket}\n`; 
      textData += `${detail?.rute_asal} - ${detail?.rute_tujuan}\n`;
      textData += '\x1B\x61\x00'; 
      textData += '--------------------------------\n';
      textData += `Nama / Kursi : ${t.pesanan.nama_penumpang} / ${t.nomor_kursi}\n`;
      const nikRapi = t.pesanan.nik.replace(/\*/g, '');
      textData += `NIK          : ${nikRapi}\n`;
      textData += `Kapal        : ${detail?.nama_kapal}\n`;
      const jamPotong = detail?.jam_berangkat.substring(0, 5); 
      textData += `Tgl/Jam      : ${detail?.tanggal}/${jamPotong}\n`; 
      textData += '--------------------------------\n';
      
      let metodePrint = 'Cash';
      if (t.pesanan.metode_bayar === 'simulasi_online' || t.pesanan.kanal === 'online') metodePrint = 'Qris';
      
      textData += `${metodePrint} TOTAL: Rp ${detail?.harga.toLocaleString('id-ID')}\n`;
      
      textData += '--------------------------------\n';
      textData += 'Perlihatkan e-tiket ke petugas\n';
      textData += `Loket : ${t.pesanan.nama_penjual_asli}\n`;

      await writer.write(encoder.encode(textData));
      await writer.write(encoder.encode('\x1B\x61\x01'));

      const imageBytes = new Uint8Array(rasterData.length);
      for (let i = 0; i < rasterData.length; i++) {
        imageBytes[i] = rasterData.charCodeAt(i);
      }
      await writer.write(imageBytes);
      
      const endData = '\x1B\x4A\x46\x1D\x56\x00'; 
      await writer.write(encoder.encode(endData));

      writer.releaseLock();
      await port.close();
      
      setPesanShare('✅ Berhasil dikirim ke printer!');
      
    } catch (err: any) {
      console.error(err);
      setPesanShare('❌ Gagal mencetak: ' + (err.message || 'Pastikan printer menyala dan port dipilih dengan benar.'));
    }
  }

  async function handleKembali() {
    const sesi = getOperatorSession()
    
    if (sesi) {
      if (sesi.role === 'terminal_keberangkatan') {
        router.push('/dashboard/keberangkatan')
      } else if (sesi.role === 'agen') {
        router.push('/dashboard/agen')
      } else if (sesi.role === 'admin_utama') {
        router.push('/dashboard')
      } else {
        router.push('/dashboard/loket-menu')
      }
      return
    }

    router.push('/')
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat e-tiket...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (tiketList.length === 0 || !detail) return <p className="p-6 text-gray-900">Data tidak lengkap</p>

  const isOnline = tiketList[0]?.pesanan.kanal === 'online'

  const TiketCard = ({ t }: { t: TiketLengkap }) => {
    let labelMetode = 'Cash';
    if (t.pesanan.metode_bayar === 'simulasi_online' || t.pesanan.kanal === 'online') labelMetode = 'Qris';

    return (
      <div className="thermal-card p-6 text-gray-900 bg-white border border-gray-200 rounded-lg mb-4">
        <div className="text-center mb-4">
          <p className="font-bold text-sm thermal-title">{t.pesanan.kode_tiket}</p>
        </div>
        <div className="flex justify-center mb-4">
          <img src={t.qrUrl} alt="QR Code" className="w-40 h-40 thermal-qr" />
        </div>
        <div className="text-center mb-2 font-bold text-sm">{detail?.rute_asal} - {detail?.rute_tujuan}</div>
        
        <hr className="my-4 border-dashed border-gray-300" />
        <div className="text-sm space-y-2 thermal-text">
          <div className="flex justify-between">
            <span className="text-gray-500">Nama / Kursi</span>
            <span className="font-bold text-gray-900">{t.pesanan.nama_penumpang} / {t.nomor_kursi}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">NIK</span>
            <span className="font-medium text-gray-900">{t.pesanan.nik.replace(/\*/g, '')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Kapal</span>
            <span className="font-medium text-gray-900">{detail?.nama_kapal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tgl/Jam</span>
            <span className="font-medium text-gray-900">{detail?.tanggal}/{detail?.jam_berangkat.substring(0, 5)}</span>
          </div>
        </div>
        <hr className="my-4 border-dashed border-gray-300" />
        <div className="flex justify-between items-center thermal-text">
          <span className="font-bold text-gray-900 text-center w-full block">{labelMetode} TOTAL: Rp {detail?.harga.toLocaleString('id-ID')}</span>
        </div>
        <div className="mt-4 text-center text-xs text-gray-400 border-t pt-2 thermal-text">
          Perlihatkan e-tiket ke petugas<br/>
          Loket : {t.pesanan.nama_penjual_asli}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-md mx-auto">
        
        <div className="flex justify-between items-center mb-4 print-hidden">
          <button onClick={handleKembali} className="text-blue-600 text-sm hover:underline font-medium bg-white px-3 py-1 rounded shadow-sm border border-gray-200">
            ← Halaman Utama
          </button>
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900">E-Tiket</h1>
            <p className="text-xs text-gray-600">Total {tiketList.length} tiket</p>
          </div>
        </div>

        {pesanShare && (
          <p className="text-sm text-center text-gray-900 mb-3 bg-yellow-100 p-2 rounded print-hidden">{pesanShare}</p>
        )}

        {tiketList.length > 1 && (
          <button
            onClick={simpanSemuaPdf}
            className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 font-bold mb-6 shadow-md print-hidden"
          >
            📥 Simpan Semua Tiket (PDF)
          </button>
        )}

        <div className="space-y-6">
          {tiketList.map((t, idx) => (
            <div key={t.pesanan.id} className="bg-white rounded shadow overflow-hidden print:shadow-none print:border-none">
              <div className="bg-blue-600 text-white px-4 py-2 text-sm font-medium print-hidden">
                Tiket #{idx + 1} dari {tiketList.length}
              </div>

              <div
                ref={(el) => {
                  tiketRefs.current[t.pesanan.id] = el
                }}
              >
                <TiketCard t={t} />
              </div>

              <div className="p-4 border-t space-y-2 bg-gray-50 relative share-container print-hidden">
                {!isOnline && (
                  <button
                    onClick={() => handleCetakThermal(t)}
                    className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 text-sm font-bold shadow-sm mb-2"
                  >
                    🖨️ Cetak Thermal (Langsung)
                  </button>
                )}

                <button
                  onClick={() => simpanPdfSatu(t.pesanan.id, t.pesanan.nama_penumpang)}
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm font-bold shadow-sm"
                >
                  📄 Simpan Tiket (PDF)
                </button>

                <button
                  onClick={() => setShowShareMenu(showShareMenu === t.pesanan.id ? null : t.pesanan.id)}
                  className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 text-sm font-medium shadow-sm"
                >
                  📤 Share / Kirim Tiket
                </button>

                {showShareMenu === t.pesanan.id && (
                  <div className="absolute bottom-20 left-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-50 flex justify-around">
                    <button onClick={() => shareKe(t.pesanan.id, t.pesanan.kode_tiket, 'wa')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded">
                      <span className="text-2xl text-green-500 mb-1">🟢</span>
                      <span className="text-xs font-medium text-gray-700">WhatsApp</span>
                    </button>
                    <button onClick={() => shareKe(t.pesanan.id, t.pesanan.kode_tiket, 'tele')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded">
                      <span className="text-2xl text-blue-500 mb-1">🔵</span>
                      <span className="text-xs font-medium text-gray-700">Telegram</span>
                    </button>
                    <button onClick={() => shareKe(t.pesanan.id, t.pesanan.kode_tiket, 'email')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded">
                      <span className="text-2xl text-red-500 mb-1">🔴</span>
                      <span className="text-xs font-medium text-gray-700">Email</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default function EtiketPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900">Memuat...</p>}>
      <EtiketContent />
    </Suspense>
  )
}