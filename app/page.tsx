'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DAFTAR_KOTA } from '@/lib/data-armada';

export default function Home() {
  const router = useRouter();
  const [asal, setAsal] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [jadwal, setJadwal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const clickCount = useRef(0);
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString();
    const jamSekarang = now.getHours();
    
    if (jamSekarang >= 16) {
      const besok = new Date(now.getTime() - offset + 24 * 60 * 60 * 1000);
      setTanggal(besok.toISOString().split('T')[0]);
    } else {
      setTanggal(localISOTime.split('T')[0]);
    }
  }, []);

  const handleSecretLogin = () => {
    clickCount.current += 1;
    if (clickTimeout.current) clearTimeout(clickTimeout.current);

    if (clickCount.current === 3) {
      router.push('/login');
      clickCount.current = 0;
    } else {
      clickTimeout.current = setTimeout(() => {
        clickCount.current = 0;
      }, 1000);
    }
  };

  const handleTukarRute = () => {
    const tempAsal = asal;
    setAsal(tujuan);
    setTujuan(tempAsal);
  };

  const getWaktuLokal = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString();
    return {
      tanggalLokal: localISOTime.split('T')[0],
      jamLokal: localISOTime.split('T')[1].substring(0, 5),
    };
  };

  const handleCari = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setHasSearched(true);

    const { tanggalLokal, jamLokal } = getWaktuLokal();
    const tanggalCari = tanggal ? tanggal : tanggalLokal;

    // 1. Ambil Template
    const { data: templates } = await supabase
      .from('template_jadwal')
      .select(`*, kapal:kapal_id (kapasitas, layout_kursi)`)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)
      .eq('aktif', true);

    // 2. Ambil Jadwal yang sudah ada di tanggal tersebut
    let { data, error } = await supabase
      .from('jadwal')
      .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi, foto_url)`)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)
      .eq('tanggal', tanggalCari)
      .eq('status_jadwal', 'open')
      .order('jam_berangkat', { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    // 3. Logika Sinkronisasi (Hanya buat jadwal jika benar-benar belum ada)
    if (templates && templates.length > 0) {
      const newJadwalPayload: any[] = [];
      
      for (const t of templates) {
        const existing = data?.find((j: any) => j.kapal_id === t.kapal_id);
        
        // Jika jadwal dengan kapal ini belum ada di tanggal tsb, siapkan data insert
        if (!existing) {
          newJadwalPayload.push({
            kapal_id: t.kapal_id,
            rute_asal: t.rute_asal,
            rute_tujuan: t.rute_tujuan,
            tanggal: tanggalCari,
            jam_berangkat: t.jam_berangkat,
            harga: 150000, 
            status_jadwal: 'open',
          });
        } else {
          // Jika sudah ada tapi jamnya beda (karena admin ubah template), kita update
          if (existing.jam_berangkat !== t.jam_berangkat) {
            const { count } = await supabase
              .from('pesanan')
              .select('*', { count: 'exact', head: true })
              .eq('jadwal_id', existing.id);

            if (count === 0) {
              await supabase
                .from('jadwal')
                .update({ jam_berangkat: t.jam_berangkat })
                .eq('id', existing.id);
            }
          }
        }
      }

      // Insert jadwal baru (jika ada) menggunakan ignoreDuplicates
      if (newJadwalPayload.length > 0) {
        const { data: insertedJadwal } = await supabase
          .from('jadwal')
          .insert(newJadwalPayload, { ignoreDuplicates: true })
          .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi, foto_url)`);

        if (insertedJadwal) {
          const kursiPayload: any[] = [];
          for (const j of insertedJadwal) {
            const t = templates.find((x: any) => x.jam_berangkat === j.jam_berangkat);
            const kapasitas = t?.kapal?.kapasitas || 0;
            if (kapasitas > 0) {
              for (let i = 1; i <= kapasitas; i++) {
                kursiPayload.push({
                  jadwal_id: j.id,
                  nomor_kursi: i.toString(),
                  status: 'kosong'
                });
              }
            }
          }
          if (kursiPayload.length > 0) {
            await supabase.from('kursi').insert(kursiPayload, { ignoreDuplicates: true });
          }
        }
      }

      // Ambil ulang data jadwal paling fresh setelah proses sinkronisasi
      const { data: refreshedData } = await supabase
        .from('jadwal')
        .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi, foto_url)`)
        .eq('rute_asal', asal)
        .eq('rute_tujuan', tujuan)
        .eq('tanggal', tanggalCari)
        .eq('status_jadwal', 'open')
        .order('jam_berangkat', { ascending: true });
      
      if (refreshedData) data = refreshedData;
    }

    // 4. Filter jam (minimal 60 menit sebelum berangkat jika hari ini)
    let filteredData = data || [];
    if (tanggalCari === tanggalLokal) {
      filteredData = filteredData.filter((j: any) => {
        const jamBerangkat = j.jam_berangkat.substring(0, 5);
        const [jamB, menitB] = jamBerangkat.split(':').map(Number);
        const [jamL, menitL] = jamLokal.split(':').map(Number);
        const totalMenitBerangkat = (jamB * 60) + menitB;
        const totalMenitSekarang = (jamL * 60) + menitL;
        return (totalMenitBerangkat - totalMenitSekarang) >= 60;
      });
    }

    setJadwal(filteredData);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-12 px-4 pb-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-6">
        <div className="text-center mb-6">
          <h2 onClick={handleSecretLogin} className="text-2xl font-bold text-gray-900 cursor-default select-none">
            Pesan Tiket Kapal
          </h2>
          <p className="text-sm text-gray-500 mt-1">Kalimantan Utara</p>
        </div>

        <form onSubmit={handleCari} className="space-y-4 relative">
          <div>
            <label className="block text-sm font-medium text-gray-700">Dari</label>
            <select required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500" value={asal} onChange={(e) => setAsal(e.target.value)}>
              <option value="">-- Pilih Kota --</option>
              {DAFTAR_KOTA.map((kota) => <option key={kota} value={kota}>{kota}</option>)}
            </select>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <button type="button" onClick={handleTukarRute} className="bg-white border border-gray-300 rounded-full p-2 shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-400 transition-colors" title="Tukar Rute">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Ke</label>
            <select required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500" value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
              <option value="">-- Pilih Kota --</option>
              {DAFTAR_KOTA.map((kota) => <option key={kota} value={kota}>{kota}</option>)}
            </select>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700">Tanggal</label>
            <input type="date" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50">
            {loading ? 'Mencari...' : 'Cari Jadwal'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500 mb-2">Lupa atau belum cetak e-tiket?</p>
          <Link href="/cek-tiket" className="inline-block w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100">
            Cek Transaksi / Tiket Anda
          </Link>
        </div>
      </div>

      {hasSearched && (
        <div className="max-w-3xl w-full mt-8 space-y-3 mb-10">
          <h3 className="text-lg font-bold text-gray-800 border-b pb-2">Jadwal Tersedia</h3>
          {jadwal.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Tidak ada jadwal yang tersedia atau waktu pembelian sudah ditutup.</p>
          ) : (
            jadwal.map((j) => (
              <div key={j.id} className="bg-white px-4 py-3 rounded-lg shadow border border-gray-200 flex items-center justify-between gap-2 md:gap-4">
                <div className="w-16 h-12 md:w-24 md:h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center border">
                  {j.kapal?.foto_url ? (
                    <img src={j.kapal.foto_url} alt={j.kapal?.nama} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-gray-400">No Foto</span>
                  )}
                </div>
                <div className="font-bold text-sm md:text-lg text-gray-900 w-12 md:w-14 text-center">
                  {j.jam_berangkat.substring(0,5)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm md:text-base text-gray-900 truncate">{j.kapal?.nama}</p>
                  <p className="text-xs md:text-sm text-gray-600 truncate">{j.rute_asal} - {j.rute_tujuan}</p>
                </div>
                <div className="font-bold text-blue-600 text-xs md:text-base text-right w-20 md:w-24">
                  Rp {j.harga?.toLocaleString('id-ID')}
                </div>
                <div className="w-20 md:w-24 flex-shrink-0">
                  <Link href={`/kursi?jadwal=${j.id}`} className="block w-full text-center py-1.5 border border-transparent rounded-md shadow-sm text-xs md:text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                    Pilih
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}